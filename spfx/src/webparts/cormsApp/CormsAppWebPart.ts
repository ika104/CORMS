import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { type IPropertyPaneConfiguration, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

import * as strings from 'CormsAppWebPartStrings';
import { App } from '../../app/App';

export interface ICormsAppWebPartProps {
  description: string;
}

// Kept thin per §7.1: reads minimal props and mounts <App/>. All shell/routing/
// theming/i18n/service logic lives in src/app and below — never here.
export default class CormsAppWebPart extends BaseClientSideWebPart<ICormsAppWebPartProps> {
  public render(): void {
    const element: React.ReactElement = React.createElement(App, {
      context: this.context,
    });

    ReactDom.render(element, this.domElement);
  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: strings.PropertyPaneDescription,
          },
          groups: [
            {
              groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField('description', {
                  label: strings.DescriptionFieldLabel,
                }),
              ],
            },
          ],
        },
      ],
    };
  }
}
