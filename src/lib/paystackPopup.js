import PaystackPop from '@paystack/inline-js';

export function openPaystackPopup(accessCode) {
  if (!accessCode) return Promise.reject(new Error('The secure payment session is missing. Please try again.'));
  return new Promise((resolve, reject) => {
    const popup = new PaystackPop();
    popup.resumeTransaction(accessCode, {
      onSuccess: transaction => resolve({ status: 'success', transaction }),
      onCancel: () => resolve({ status: 'cancelled' }),
      onError: error => reject(new Error(error?.message || 'Paystack could not open the secure payment panel.')),
    });
  });
}
