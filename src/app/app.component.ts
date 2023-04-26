import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  paymentRequestObject: google.payments.api.PaymentDataRequest;
  expression = false;

  ngOnInit() {
    const callbackIntents: google.payments.api.CallbackIntent[] = [
      'PAYMENT_AUTHORIZATION',
    ];
    const allowedCardNetworks: google.payments.api.CardNetwork[] = [
      'MASTERCARD',
      'VISA',
      'AMEX',
      'DISCOVER',
      'ELECTRON',
      'ELO',
      'ELO_DEBIT',
      'MAESTRO',
    ];
    let shippingAddressParameters: google.payments.api.ShippingAddressParameters =
      {
        allowedCountryCodes: [],
        phoneNumberRequired: true,
      };
    const paymentRequestParameters: google.payments.api.CardParameters = {
      allowedCardNetworks,
      allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
      billingAddressRequired: true,
    };

    this.paymentRequestObject = {
      apiVersion: 2,
      apiVersionMinor: 0,
      callbackIntents,
      allowedPaymentMethods: [
        {
          type: 'CARD',
          parameters: paymentRequestParameters,
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: {
              gateway: 'csgforte',
              gatewayMerchantId: '124125',
            },
          },
        },
      ],
      merchantInfo: {
        merchantName: 'TestName',
        merchantId: 'Test',
      },
      shippingAddressRequired: true,
      shippingAddressParameters,
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPriceLabel: 'Total',
        totalPrice: '500',
        currencyCode: 'INR',
      },
    };

    setTimeout(() => {
      this.expression = true;
    }, 100);
  }

  paymentAuthorized: google.payments.api.PaymentAuthorizedHandler = (
    paymentData
  ) => {
    console.log('paymentData', paymentData);

    return { transactionState: 'SUCCESS' };
  };
  loadPaymentData(paymentData: google.payments.api.PaymentData) {
    console.info(paymentData);
  }

  readyToPayChange(result: any) {
    console.log('readyToPayChange', result);
  }

  cancelCB(reason: google.payments.api.PaymentsError) {
    console.log('cancel ', reason);
  }

  error(error: Error | google.payments.api.PaymentsError) {
    console.error('error', error);
  }

  clickCB(event: Event) {
    console.log('clickCB', event);
  }
}
