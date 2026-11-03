"""Check whether an exported CORMSApprovals solution can actually be imported somewhere else.

Run it on a fresh export before every handover:

    pac solution export --name CORMSApprovals --path <dir> --overwrite
    python tools/check_export_readiness.py <dir>/CORMSApprovals.zip

It reports three classes of problem:
  * connection references a flow binds to that the package does not carry (import breaks)
  * connection references the package carries that nothing uses (target admins get asked
    to bind connections for nothing)
  * values pinned to this tenant - site addresses and list GUIDs - in the flows and in the
    canvas app, each of which has to become an environment variable before the package travels
"""
import io
import json
import re
import sys
import zipfile

PARAM = r'"%s":\s*"([^"]*)"'
TENANT_URL = re.compile(r"https://[a-z0-9-]+\.sharepoint\.com/sites/[A-Za-z0-9_-]+")


def flows(z):
    for n in z.namelist():
        if n.startswith("Workflows/") and n.endswith(".json"):
            yield n.split("/", 1)[1], json.loads(z.read(n))


def declared_refs(z):
    xml = z.read("customizations.xml").decode("utf-8", "ignore")
    return set(re.findall(r'connectionreferencelogicalname="([^"]+)"', xml))


def used_refs(z):
    used = {}
    for name, body in flows(z):
        refs = body.get("properties", {}).get("connectionReferences", {}) or {}
        for v in refs.values():
            logical = (v.get("connection") or {}).get("connectionReferenceLogicalName")
            if logical:
                used.setdefault(logical, []).append(name)
    return used


def canvas_apps(z):
    """Every canvas app in the package, as (name, opened msapp)."""
    for n in z.namelist():
        if n.endswith("_DocumentUri.msapp"):
            yield n.rsplit("/", 1)[-1][: -len("_DocumentUri.msapp")], zipfile.ZipFile(io.BytesIO(z.read(n)))


def bindings(app):
    """What each SharePoint data source in a canvas app is bound to.

    A converted app keeps the literal site and list GUID as its design-time value and adds
    an environmentVariableName override beside it; that override is what the runtime uses in
    another environment. Reading DataSources.json alone therefore says nothing - the answer
    lives in Properties.json/LocalConnectionReferences.
    """
    pinned, variables = [], set()
    props = json.loads(app.read("Properties.json"))
    refs = json.loads(props.get("LocalConnectionReferences") or "{}")
    for conn in refs.values():
        for dataset, ds in (conn.get("datasets") or {}).items():
            # the site variable is encoded in the dataset key: "<site url>_<variable name>"
            for part in dataset.split("_", 1)[1:]:
                if part.startswith(("new_", "corms_")) or "shared_" in part:
                    variables.add(part)
            for name, info in (ds.get("dataSources") or {}).items():
                override = info.get("tableNameOverride") or {}
                variable = override.get("environmentVariableName") if isinstance(override, dict) else None
                if variable:
                    variables.add(variable)
                else:
                    pinned.append((name, info.get("tableName")))
    return pinned, variables


def declared_variables(z):
    """Definitions ship as their own folder per variable, not inside customizations.xml."""
    return {
        n.split("/")[1]
        for n in z.namelist()
        if n.startswith("environmentvariabledefinitions/") and n.count("/") >= 2
    }


def packaged_values(z):
    """A value packaged with a definition is this tenant's value; the target should supply
    its own, so a value in the package is a hand-me-down waiting to be imported by mistake."""
    out = {}
    for n in z.namelist():
        if n.endswith("environmentvariablevalues.json"):
            body = json.loads(z.read(n) or b'{}')
            v = body.get("environmentvariablevalues", {}).get("environmentvariablevalue")
            for entry in (v if isinstance(v, list) else [v] if v else []):
                if isinstance(entry, dict) and entry.get("value"):
                    out[n.split("/")[1]] = entry["value"]
    return out


def main(path):
    z = zipfile.ZipFile(path)
    declared, used = declared_refs(z), used_refs(z)
    problems = 0

    print("== connection references ==")
    for logical, where in sorted(used.items()):
        if logical not in declared:
            problems += 1
            print(f"  MISSING  {logical}")
            for w in where:
                print(f"           used by {w}")
    for logical in sorted(declared - set(used)):
        print(f"  unused   {logical}")
    if not (set(used) - declared):
        print("  all referenced connection references are packaged")

    print("")
    print("== flows ==")
    flowbad = 0
    for name, body in flows(z):
        text = json.dumps(body)
        bad = []
        for key in ("dataset", "table"):
            for value in re.findall(PARAM % key, text):
                # a converted action reads its site or list from a variable at run time
                if value and not value.startswith("@parameters("):
                    bad.append((key, value))
        if bad:
            flowbad += len(bad)
            print("  " + name[:46])
            for key, value in bad:
                print("    PINNED %s: %s" % (key, value[:70]))
    problems += flowbad
    if not flowbad:
        print("  every flow reads its site and list from a variable")

    print("== canvas apps ==")
    declared_vars, used_vars = declared_variables(z), set()
    for name, app in canvas_apps(z):
        pinned, variables = bindings(app)
        used_vars |= variables
        yaml = "".join(
            app.read(n).decode("utf-8", "ignore") for n in app.namelist() if n.endswith(".pa.yaml")
        )
        urls = sorted(set(TENANT_URL.findall(yaml)))
        problems += len(pinned)
        print(f"  {name}")
        print(f"    {len(variables)} data source(s) bound to an environment variable")
        for src, guid in pinned:
            print(f"    PINNED  {src} -> {guid}")
        for u in urls:
            print(f"    formula literal (fallback only, check it is not the live value)  {u}")

    print()
    print("== environment variables ==")
    for v in sorted(used_vars - declared_vars):
        problems += 1
        print(f"  MISSING from the solution  {v}")
    for v in sorted(declared_vars - used_vars):
        print(f"  unused                     {v}")
    if used_vars and not (used_vars - declared_vars):
        print(f"  all {len(used_vars)} variables the apps use are packaged")
    vals = packaged_values(z)
    if vals:
        print(f"  {len(vals)} variable(s) carry THIS tenant's value into the package:")
        for k, v in sorted(vals.items()):
            print(f"    {k[-12:]}  {v}")

    xml = z.read("solution.xml").decode("utf-8", "ignore")
    managed = re.search(r"<Managed>(\d)</Managed>", xml).group(1)
    version = re.search(r"<Version>([^<]+)</Version>", xml).group(1)
    print(f"\n== package ==\n  version {version}, {'managed' if managed == '1' else 'UNMANAGED'}")

    print(f"\n{problems} issue(s) blocking a clean import elsewhere.")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "CORMSApprovals.zip"))
