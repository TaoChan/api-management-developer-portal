import { IApiClient } from "../clients";
import { Page } from "../models/page";
import { Subscription } from "../models/subscription";
import { Product } from "../models/product";
import { SubscriptionContract, SubscriptionState } from "../contracts/subscription";
import { ProductContract } from "../contracts/product";
import { TenantService } from "../services/tenantService";
import { HttpHeader } from "@paperbits/common/http";
import * as Constants from "../constants";
import { Utils } from "../utils";
import { SearchQuery } from "../contracts/searchQuery";
import { SubscriptionSecrets } from "../contracts/subscriptionSecrets";
import { ApiContract } from "../contracts/api";

/**
 * A service for management operations with products.
 */
export class ProductService {
    constructor(
        private readonly apiClient: IApiClient,
        private readonly tenantService: TenantService
    ) { }

    /**
     * Returns user subscriptions.
     * @param userId {string} User unique identifier.
     * @param productId {string} Product unique identifier.
     */
    public async getSubscriptions(userId: string, productId?: string): Promise<Page<Subscription>> {
        if (!userId) {
            throw new Error(`Parameter "userId" not specified.`);
        }

        const pageOfSubscriptions = new Page<Subscription>();
        const query = productId ? `?$filter=properties/scope eq '${productId}'` : "";

        try {
            const pageContract = await this.apiClient.get<Page<SubscriptionContract>>(`${userId}/subscriptions${query}`, [await this.apiClient.getPortalHeader("getSubscriptions")]);
            const promises: Promise<void>[] = [];
            const subscriptions: Subscription[] = [];

            for (const subscriptionContract of pageContract.value) {
                const subscription = new Subscription(subscriptionContract);

                const secretPromise = this.apiClient
                    .post<SubscriptionSecrets>(`${userId}/subscriptions/${subscriptionContract.name}/listSecrets`, [await this.apiClient.getPortalHeader("getSubscriptionSecrets")])
                    .then(secrets => {
                        subscription.primaryKey = secrets.primaryKey;
                        subscription.secondaryKey = secrets.secondaryKey;
                    });

                promises.push(secretPromise);

                subscriptions.push(subscription);
            }

            await Promise.all(promises);

            pageOfSubscriptions.value = subscriptions;
            pageOfSubscriptions.count = pageContract.count;
            pageOfSubscriptions.nextLink = pageContract.nextLink;

            return pageOfSubscriptions;
        }
        catch (error) {
            if (error?.code === "ResourceNotFound") {
                return pageOfSubscriptions;
            }

            throw new Error(`Unable to retrieve subscriptions for user with ID "${userId}". Error: ${error.message}`);
        }
    }

    /**
     * Returns user subscriptions for specified product.
     * @param userId {string} User unique identifier.
     * @param productId {string} Product unique identifier.
     */
    public async getSubscriptionsForProduct(userId: string, productId: string): Promise<Page<Subscription>> {
        if (!userId) {
            throw new Error(`Parameter "userId" not specified.`);
        }

        if (!productId) {
            throw new Error(`Parameter "productId" not specified.`);
        }

        try {
            const pageOfSubscriptions = await this.getSubscriptions(userId, productId);
            return pageOfSubscriptions;
        }
        catch (error) {
            if (error && error.code === "ResourceNotFound") {
                return new Page();
            }

            throw new Error(`Unable to retrieve subscriptions for user with ID "${userId}". Error: ${error.message}`);
        }
    }

    /**
     * Returns user subscriptions with product name.
     * @param userId {string} User unique identifier.
     */
    public async getUserSubscriptionsWithProductName(userId: string): Promise<Subscription[]> {
        if (!userId) {
            throw new Error(`Parameter "userId" not specified.`);
        }

        const result = [];
        const pageOfSubscriptions = await this.apiClient.get<Page<SubscriptionContract>>(`${userId}/subscriptions`, [await this.apiClient.getPortalHeader("getUserSubscriptions")]);

        if (!pageOfSubscriptions?.value) {
            return result;
        }

        const subscriptions = pageOfSubscriptions.value;
        const promises = [];

        for (const subscription of subscriptions) {
            const subscriptionModel = new Subscription(subscription);

            if (subscription.properties.scope.endsWith("/apis")) {
                subscriptionModel.productName = "All APIs";
            } else
                if (subscription.properties.scope.includes("/apis/")) {
                    const apiName = Utils.getResourceName("apis", subscription.properties.scope);

                    const apiPromise = this.apiClient
                        .get<ApiContract>(`/apis/${apiName}`)
                        .then(api => {
                            subscriptionModel.productName = `API: ${api.name}`;
                        }).catch(error => console.log(`Get API error: ${error.message}`));

                    promises.push(apiPromise);
                } else {
                    const productName = Utils.getResourceName("products", subscription.properties.scope);

                    const productPromise = this.apiClient
                        .get<ProductContract>(`/products/${productName}`)
                        .then(product => {
                            subscriptionModel.productName = product.properties.displayName;
                        }).catch(error => console.log(`Get product error: ${error.message}`));

                    promises.push(productPromise);
                }

            const secretPromise = this.apiClient
                .post<SubscriptionSecrets>(`${userId}/subscriptions/${subscription.name}/listSecrets`)
                .then(secrets => {
                    subscriptionModel.primaryKey = secrets.primaryKey;
                    subscriptionModel.secondaryKey = secrets.secondaryKey;
                });

            promises.push(secretPromise);

            result.push(subscriptionModel);
        }

        await Promise.all(promises);

        return result;
    }

    /**
     * Returns a subsription by ID.
     * @param subscriptionId subscriptionId {string} Subscription unique identifier.
     * @param loadProduct {boolean} Indicates whether products should be included.
     */
    public async getSubscription(subscriptionId: string): Promise<Subscription> {
        if (!subscriptionId) {
            throw new Error(`Parameter "subscriptionId" not specified.`);
        }

        const contract = await this.apiClient.get<SubscriptionContract>(subscriptionId, [await this.apiClient.getPortalHeader("getSubscription")]);

        if (!contract) {
            return null;
        }

        const secrets = await this.apiClient
            .post<SubscriptionSecrets>(`${subscriptionId}/listSecrets`, [await this.apiClient.getPortalHeader("getSubscriptionSecrets")]);

        const subscripitonModel = new Subscription(contract);
        subscripitonModel.primaryKey = secrets.primaryKey;
        subscripitonModel.secondaryKey = secrets.secondaryKey;

        return subscripitonModel;
    }

    /**
     * Returns all products.
     * TODO: Review naming and usage.
     */
    public async getProducts(getAll: boolean = false): Promise<Product[]> {
        const result = [];
        const contracts = await this.apiClient.get<Page<ProductContract>>(`/products`, [await this.apiClient.getPortalHeader("getProducts")]);

        if (contracts && contracts.value) {
            if (getAll) {
                contracts.value.map(item => result.push(new Product(item)));
            }
            else {
                contracts.value
                    .filter(x => x.properties.subscriptionRequired === true)
                    .map(item => result.push(new Product(item)));
            }
        }

        return result;
    }

    /**
     * Returns page of products filtered by name.
     */
    public async getProductsPage(filter: SearchQuery): Promise<Page<Product>> {
        const skip = filter.skip || 0;
        const take = filter.take || Constants.defaultPageSize;
        let query = `/products?$top=${take}&$skip=${skip}`;

        if (filter.pattern) {
            query = Utils.addQueryParameter(query, `$filter=(contains(properties/displayName,'${encodeURIComponent(filter.pattern)}'))`);
        }

        const page = await this.apiClient.get<Page<ProductContract>>(query, [await this.apiClient.getPortalHeader("getProductsPage")]);
        const result = new Page<Product>();
        result.count = page.count;
        result.nextLink = page.nextLink;
        result.value = page.value.map(item => new Product(item));
        return result;
    }

    /**
     * Returns a product with specified ID.
     * @param productId {string} Product unique identifier.
     */
    public async getProduct(productId: string): Promise<Product> {
        if (!productId) {
            throw new Error(`Parameter "productId" not specified.`);
        }

        const contract = await this.apiClient.get<ProductContract>(productId, [await this.apiClient.getPortalHeader("getProduct")]);

        if (contract) {
            return new Product(contract);
        }
        return undefined;
    }

    /**
     * Regenerates subscription primary key.
     * @param subscriptionId subscriptionId {string} Subscription unique identifier.
     */
    public async regeneratePrimaryKey(subscriptionId: string): Promise<Subscription> {
        if (!subscriptionId) {
            throw new Error(`Parameter "subscriptionId" not specified.`);
        }

        await this.apiClient.post(`${subscriptionId}/regeneratePrimaryKey`, [await this.apiClient.getPortalHeader("regeneratePrimaryKey")]);

        return await this.getSubscription(subscriptionId);
    }

    /**
     * Regenerates subscription secondary key.
     * @param subscriptionId {string} Subscription unique identifier.
     */
    public async regenerateSecondaryKey(subscriptionId: string): Promise<Subscription> {
        await this.apiClient.post(`${subscriptionId}/regenerateSecondaryKey`, [await this.apiClient.getPortalHeader("regenerateSecondaryKey")]);
        return await this.getSubscription(subscriptionId);
    }

    /**
     * Creates subscription to specified product.
     * @param subscriptionId {string} Subscription unique identifier.
     * @param userId {string} User unique identifier.
     * @param productId {string} Product unique identifier.
     * @param subscriptionName  {string} Subscription name.
     */
    public async createSubscription(subscriptionId: string, userId: string, productId: string, subscriptionName: string): Promise<void> {
        if (!subscriptionId) {
            throw new Error(`Parameter "subscriptionId" not specified.`);
        }

        if (!userId) {
            throw new Error(`Parameter "userId" not specified.`);
        }

        const isDelegationEnabled = await this.tenantService.isSubscriptionDelegationEnabled();

        if (isDelegationEnabled) {
            console.warn("Delegation enabled. Can't create subscription.");
        }
        else {
            const payload = {
                properties: {
                    scope: productId,
                    name: subscriptionName,
                    appType: Constants.AppType
                }
            };
            await this.apiClient.put(userId + subscriptionId, [await this.apiClient.getPortalHeader("createSubscription")], payload);
        }
    }

    /**
     * Cancels subscription.
     * @param subscriptionId subscriptionId {string} Subscription unique identifier.
     */
    public async cancelSubscription(subscriptionId: string): Promise<Subscription> {
        if (!subscriptionId) {
            throw new Error(`Parameter "subscriptionId" not specified.`);
        }

        const isDelegationEnabled = await this.tenantService.isSubscriptionDelegationEnabled();

        if (isDelegationEnabled) {
            console.warn("Delegation enabled. Can't cancel subscription");
        }
        else {
            const headers: HttpHeader[] = [{ name: "If-Match", value: "*" }, await this.apiClient.getPortalHeader("cancelSubscription")];

            const payload = {
                properties: {
                    state: SubscriptionState.cancelled
                }
            };

            await this.apiClient.patch(`${subscriptionId}?appType=${Constants.AppType}`, headers, payload);
        }

        return await this.getSubscription(subscriptionId);
    }

    /**
     * Updates subscription name.
     * @param subscriptionId subscriptionId {string} Subscription unique identifier.
     * @param subscriptionName {string} New subscription name.
     */
    public async renameSubscription(subscriptionId: string, subscriptionName: string): Promise<Subscription> {
        if (!subscriptionId) {
            throw new Error(`Parameter "subscriptionId" not specified.`);
        }

        if (!subscriptionName) {
            throw new Error(`Parameter "subscriptionName" not specified.`);
        }

        const headers: HttpHeader[] = [{ name: "If-Match", value: "*" }, await this.apiClient.getPortalHeader("renameSubscription")];

        const payload = {
            properties: {
                name: subscriptionName
            }
        };

        await this.apiClient.patch(`${subscriptionId}?appType=${Constants.AppType}`, headers, payload);

        return await this.getSubscription(subscriptionId);
    }

    /**
     * Determines if specified subscription scope is suitable in context of an API or a Product.
     * @param scope {string} Subscription scope.
     * @param apiName {string} ARM name of the API.
     * @param productName {string} ARM name of the Product.
     */
    public isScopeSuitable(scope: string, apiName: string = null, productName: string = null): boolean {
        if (!scope) {
            throw new Error(`Parameter "scope" not specified.`);
        }

        return scope.endsWith("/apis")
            || (apiName && scope.endsWith(`/apis/${apiName}`))
            || (productName && scope.endsWith(`/products/${productName}`));
    }
}