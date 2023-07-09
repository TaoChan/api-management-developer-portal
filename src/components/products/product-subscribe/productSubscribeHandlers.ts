import { IWidgetOrder, IWidgetHandler } from "@paperbits/common/editing";
import { StyleDefinition } from "@paperbits/common/styles";
import { ProductSubscribeModel } from "./productSubscribeModel";
import * as DefaultStyleDefinitions from "../../defaultStyleDefinitions";

export class ProductSubscribeHandlers implements IWidgetHandler {
    public async getWidgetModel(): Promise<ProductSubscribeModel> {
        return new ProductSubscribeModel()
    }

    public async getWidgetOrder(): Promise<IWidgetOrder> {
        const widgetOrder: IWidgetOrder = {
            name: "productSubscribe",
            category: "Products",
            displayName: "Product: Subscribe form",
            iconClass: "widget-icon widget-icon-api-management",
            requires: ["html"],
            createModel: async () => new ProductSubscribeModel()
        };

        return widgetOrder;
    }

    public getStyleDefinitions(): StyleDefinition {
        return {
            colors: {
                borderColor: {
                    displayName: "Input border color",
                    defaults: {
                        value: "#505050"
                    }
                }
            },
            components: {
                productSubscribe: {
                    displayName: "Product Subscribe",
                    plugins: ["background", "typography", "margin", "padding"],
                    components: {
                        subscriptionInput: DefaultStyleDefinitions.getInputStyleDefinition(),
                        termsOfUseCheckbox: DefaultStyleDefinitions.getTermsOfUseCheckboxDefinition(),
                        termsOfUseTextarea: DefaultStyleDefinitions.getTermsOfUseTextAreaDefinition(),
                        subscribeButton: DefaultStyleDefinitions.getButtonStyleDefinition()
                    }
                }
            }
        };
    }
}