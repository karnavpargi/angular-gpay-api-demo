import { loadScript } from './load-gpay-script';

/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable react/no-is-mounted */

export interface ReadyToPayChangeResponse {
  isButtonVisible: boolean;
  isReadyToPay: boolean;
  paymentMethodPresent?: boolean;
}

export interface Config {
  environment: google.payments.api.Environment;
  existingPaymentMethodRequired?: boolean;
  paymentRequest: google.payments.api.PaymentDataRequest;
  onPaymentDataChanged?: google.payments.api.PaymentDataChangedHandler;
  onPaymentAuthorized?: google.payments.api.PaymentAuthorizedHandler;
  onLoadPaymentData?: (paymentData: google.payments.api.PaymentData) => void;
  onCancel?: (reason: google.payments.api.PaymentsError) => void;
  onError?: (error: Error | google.payments.api.PaymentsError) => void;
  onReadyToPayChange?: (result: ReadyToPayChangeResponse) => void;
  onClick?: (event: Event) => void;
  buttonColor?: google.payments.api.ButtonColor;
  buttonType?: google.payments.api.ButtonType;
  buttonSizeMode?: google.payments.api.ButtonSizeMode;
  buttonLocale?: string;
}

interface ButtonManagerOptions {
  cssSelector: string;
  softwareInfoId: string;
  softwareInfoVersion: string;
}

/**
 * Manages the lifecycle of the Google Pay button.
 *
 * Includes lifecycle management of the `PaymentsClient` instance,
 * `isReadyToPay`, `onClick`, `loadPaymentData`, and other callback methods.
 */
export class ButtonManager {
  private client?: google.payments.api.PaymentsClient;
  private config?: Config;
  private element?: Element;
  private options: ButtonManagerOptions;
  private oldInvalidationValues?: any[];
  isReadyToPay?: boolean;
  paymentMethodPresent?: boolean;

  constructor(options: ButtonManagerOptions) {
    this.options = options;
  }

  getElement(): Element | undefined {
    return this.element;
  }

  private isGooglePayLoaded(): boolean {
    return 'google' in window && !!google?.payments?.api?.PaymentsClient;
  }

  async mount(element: Element): Promise<void> {
    if (!this.isGooglePayLoaded()) {
      await loadScript('https://pay.google.com/gp/p/js/pay.js');
    }

    this.element = element;
    if (element) {
      this.appendStyles();
      if (this.config) {
        this.updateElement();
      }
    }
  }

  unmount(): void {
    this.element = undefined;
  }

  configure(newConfig: Config): Promise<void> {
    let promise: Promise<void> | undefined = undefined;
    this.config = newConfig;
    if (!this.oldInvalidationValues || this.isClientInvalidated(newConfig)) {
      promise = this.updateElement();
    }
    this.oldInvalidationValues = this.getInvalidationValues(newConfig);

    return promise ?? Promise.resolve();
  }

  /**
   * Creates client configuration options based on button configuration
   * options.
   *
   * This method would normally be private but has been made public for
   * testing purposes.
   *
   * @private
   */
  createClientOptions(config: Config): google.payments.api.PaymentOptions {
    const clientConfig: google.payments.api.PaymentOptions = {
      environment: config.environment,
      merchantInfo: this.createMerchantInfo(config),
    };

    if (config.onPaymentDataChanged || config.onPaymentAuthorized) {
      clientConfig.paymentDataCallbacks = {};

      if (config.onPaymentDataChanged) {
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        clientConfig.paymentDataCallbacks.onPaymentDataChanged = (
          paymentData
        ) => {
          const result = config.onPaymentDataChanged!(paymentData);
          return result || ({} as google.payments.api.PaymentDataRequestUpdate);
        };
      }

      if (config.onPaymentAuthorized) {
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        clientConfig.paymentDataCallbacks.onPaymentAuthorized = (
          paymentData
        ) => {
          const result = config.onPaymentAuthorized!(paymentData);
          return (
            result || ({} as google.payments.api.PaymentAuthorizationResult)
          );
        };
      }
    }

    return clientConfig;
  }

  private createIsReadyToPayRequest(
    config: Config
  ): google.payments.api.IsReadyToPayRequest {
    const paymentRequest = config.paymentRequest;
    const request: google.payments.api.IsReadyToPayRequest = {
      apiVersion: paymentRequest.apiVersion,
      apiVersionMinor: paymentRequest.apiVersionMinor,
      allowedPaymentMethods: paymentRequest.allowedPaymentMethods,
      existingPaymentMethodRequired: config.existingPaymentMethodRequired,
    };

    return request;
  }

  /**
   * Constructs `loadPaymentData` request object based on button configuration.
   *
   * It infers request properties like `shippingAddressRequired`,
   * `shippingOptionRequired`, and `billingAddressRequired` if not already set
   * based on the presence of their associated options and parameters. It also
   * infers `callbackIntents` based on the callback methods defined in button
   * configuration.
   *
   * This method would normally be private but has been made public for
   * testing purposes.
   *
   * @private
   */
  createLoadPaymentDataRequest(
    config: Config
  ): google.payments.api.PaymentDataRequest {
    const request = {
      ...config.paymentRequest,
      merchantInfo: this.createMerchantInfo(config),
    };

    // TODO: #13 re-enable inferrence if/when we agree as a team

    return request;
  }

  private createMerchantInfo(config: Config): google.payments.api.MerchantInfo {
    const merchantInfo: google.payments.api.MerchantInfo = {
      ...config.paymentRequest?.merchantInfo,
    };

    // apply softwareInfo if not set
    if (!merchantInfo.softwareInfo) {
      merchantInfo.softwareInfo = {
        id: this.options.softwareInfoId,
        version: this.options.softwareInfoVersion,
      };
    }

    return merchantInfo;
  }

  private isMounted(): boolean {
    return this.element != null && this.element.isConnected !== false;
  }

  private removeButton(): void {
    if (this.element instanceof ShadowRoot || this.element instanceof Element) {
      for (const child of Array.from(this.element.children)) {
        if (child.tagName !== 'STYLE') {
          child.remove();
        }
      }
    }
  }

  private async updateElement(): Promise<void> {
    if (!this.isMounted()) return;
    const element = this.getElement()!;

    if (!this.config) {
      throw new Error('google-pay-button: Missing configuration');
    }

    // remove existing button
    this.removeButton();

    this.client = new google.payments.api.PaymentsClient(
      this.createClientOptions(this.config)
    );

    const buttonOptions: google.payments.api.ButtonOptions = {
      buttonType: this.config.buttonType,
      buttonColor: this.config.buttonColor,
      buttonSizeMode: this.config.buttonSizeMode,
      buttonLocale: this.config.buttonLocale,
      onClick: this.handleClick,
      allowedPaymentMethods: this.config.paymentRequest?.allowedPaymentMethods,
    };

    const rootNode = element.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      buttonOptions.buttonRootNode = rootNode;
    }

    // pre-create button
    const button = this.client.createButton(buttonOptions);

    this.setClassName(element, [element.className, 'not-ready']);
    element.appendChild(button);

    let showButton = false;
    let readyToPay: google.payments.api.IsReadyToPayResponse | undefined;

    try {
      readyToPay = await this.client.isReadyToPay(
        this.createIsReadyToPayRequest(this.config)
      );
      showButton =
        (readyToPay.result && !this.config.existingPaymentMethodRequired) ||
        (readyToPay.result &&
          readyToPay.paymentMethodPresent &&
          this.config.existingPaymentMethodRequired) ||
        false;
    } catch (err) {
      if (this.config.onError) {
        this.config.onError(err as Error);
      } else {
        console.error(err);
      }
    }

    if (!this.isMounted()) return;

    if (showButton) {
      try {
        this.client.prefetchPaymentData(
          this.createLoadPaymentDataRequest(this.config)
        );
      } catch (err) {
        console.error(err);
      }

      // remove hidden className
      this.setClassName(
        element,
        (element.className || '')
          .split(' ')
          .filter((className) => className && className !== 'not-ready')
      );
    }

    if (
      this.isReadyToPay !== readyToPay?.result ||
      this.paymentMethodPresent !== readyToPay?.paymentMethodPresent
    ) {
      this.isReadyToPay = !!readyToPay?.result;
      this.paymentMethodPresent = readyToPay?.paymentMethodPresent;

      if (this.config.onReadyToPayChange) {
        const readyToPayResponse: ReadyToPayChangeResponse = {
          isButtonVisible: showButton,
          isReadyToPay: this.isReadyToPay,
        };

        if (this.paymentMethodPresent) {
          readyToPayResponse.paymentMethodPresent = this.paymentMethodPresent;
        }

        this.config.onReadyToPayChange(readyToPayResponse);
      }
    }
  }
  /**
   * Handles the click event of the Google Pay button.
   *
   * This method would normally be private but has been made public for
   * testing purposes.
   *
   * @private
   */
  handleClick = async (event: Event): Promise<void> => {
    const config = this.config;
    const data = {};
    if (!config) {
      throw new Error('google-pay-button: Missing configuration');
    }

    const request = this.createLoadPaymentDataRequest(config);

    try {
      if (config.onClick) {
        config.onClick(event);
      }

      if (event.defaultPrevented) {
        return;
      }

      const result = await this.client!.loadPaymentData(request);

      if (config.onLoadPaymentData) {
        config.onLoadPaymentData(result);
      }
    } catch (err) {
      if (
        (err as google.payments.api.PaymentsError).statusCode === 'CANCELED'
      ) {
        if (config.onCancel) {
          config.onCancel(err as google.payments.api.PaymentsError);
        }
      } else if (config.onError) {
        config.onError(err as google.payments.api.PaymentsError);
      } else {
        console.error(err);
      }
    }
  };

  getServiceFee(
    payment: google.payments.api.TransactionInfo,
    data: any
  ): Promise<google.payments.api.TransactionInfo> {
    return new Promise((resolve, reject) => {
      try {
        let transactionInfo: google.payments.api.TransactionInfo = {
          totalPrice: payment.totalPrice,
          currencyCode: 'USA',
          totalPriceStatus: payment.totalPriceStatus,
        };
        const payload = {
          mid: data.MerchantID,
          amount: parseFloat(data.amount) + parseFloat(data.taxAmount),
          cc: 0,
          isCC: true,
          paymentToken: '',
          cardCategory: '',
          decryptor: data.Decryptor ? data.Decryptor : '',
          emvData: data.emvData ? data.emvData : '',
          swipeData: data.swipeData ? data.swipeData : '',
        };
        data.totalAmount = (
          parseFloat(data.amount || 0) +
          parseFloat(data.taxAmount || 0) +
          parseFloat(data.serviceFee || 0)
        ).toFixed(2);
        transactionInfo = {
          displayItems: [
            {
              label: 'Subtotal',
              type: 'SUBTOTAL',
              price: parseFloat(data.amount || 0).toFixed(2),
            },
            {
              label: 'Service fee',
              type: 'LINE_ITEM',
              price: parseFloat(data.serviceFee || 0).toFixed(2),
            },
          ],
          totalPriceStatus: 'FINAL',
          totalPriceLabel: 'Total',
          totalPrice: data.totalAmount,
          currencyCode: 'USD',
          countryCode: data.billing_country,
        };
        // if (parseFloat(data.taxAmount) > 0) {
        //   transactionInfo.displayItems.push({
        //     label: 'Tax',
        //     type: 'TAX',
        //     price: parseFloat(data.taxAmount || 0).toFixed(2),
        //   });
        // }
        resolve(transactionInfo);
        data.transactionInfo = {
          total: +data.totalAmount,
          serviceFee: +data.serviceFee,
          subTotal: data.amount,
          taxAmount: +data.taxAmount,
        };
        data.isLoading = false;
        // this.store.dispatch({ type: 'UPDATE_FCO_DATA', payload: data });
      } catch (error) {
        data.isLoading = false;
        // this.store.dispatch({ type: 'UPDATE_FCO_DATA', payload: data });
        reject(error);
      }
    });
  }

  private setClassName(element: Element, classNames: string[]): void {
    const className = classNames.filter((name) => name).join(' ');
    if (className) {
      element.className = className;
    } else {
      element.removeAttribute('class');
    }
  }

  private appendStyles(): void {
    if (typeof document === 'undefined') return;

    const rootNode = this.element?.getRootNode() as
      | Document
      | ShadowRoot
      | undefined;
    const styleId = `default-google-style-${this.options.cssSelector.replace(
      /[^\w-]+/g,
      ''
    )}-${this.config?.buttonLocale}`;

    // initialize styles if rendering on the client:
    if (rootNode) {
      if (!rootNode.getElementById?.(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.type = 'text/css';
        style.innerHTML = `
          ${this.options.cssSelector} {
            display: inline-block;
          }
          ${this.options.cssSelector}.not-ready {
            width: 0;
            height: 0;
            overflow: hidden;
          }
        `;

        if (rootNode instanceof Document && rootNode.head) {
          rootNode.head.appendChild(style);
        } else {
          rootNode.appendChild(style);
        }
      }
    }
  }

  private isClientInvalidated(newConfig: Config): boolean {
    if (!this.oldInvalidationValues) return true;

    const newValues = this.getInvalidationValues(newConfig);
    return newValues.some(
      (value, index) => value !== this.oldInvalidationValues![index]
    );
  }

  private getInvalidationValues(config: Config): any[] {
    return [
      config.environment,
      config.existingPaymentMethodRequired,
      !!config.onPaymentDataChanged,
      !!config.onPaymentAuthorized,
      config.buttonColor,
      config.buttonType,
      config.buttonLocale,
      config.buttonSizeMode,
      config.paymentRequest?.merchantInfo.merchantId,
      config.paymentRequest?.merchantInfo.merchantName,
      config.paymentRequest?.merchantInfo.softwareInfo?.id,
      config.paymentRequest?.merchantInfo.softwareInfo?.version,
      config.paymentRequest?.allowedPaymentMethods,
    ];
  }
}
