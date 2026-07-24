import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { studioClient } from '@/api/studioClient';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ loading: true, error: '' });
  useEffect(() => {
    const verificationToken = params.get('token');
    if (!verificationToken) return setState({ loading: false, error: 'The verification link is incomplete.' });
    studioClient.auth.verifyEmail(verificationToken)
      .then(() => setState({ loading: false, error: '' }))
      .catch(error => setState({ loading: false, error: error.message }));
  }, [params]);
  return (
    <AuthLayout icon={MailCheck} title={state.loading ? 'Verifying email' : state.error ? 'Verification failed' : 'Email verified'}
      subtitle={state.loading ? 'Please wait a moment.' : state.error || 'Your email address is now confirmed.'}
      footer={<Link to="/account" className="text-brass">Continue to my account</Link>}>
      <p className="text-center text-sm text-ivory/50">{state.loading ? 'Checking your secure link…' : state.error ? 'Request another verification email from your account.' : 'Thank you for confirming your address.'}</p>
    </AuthLayout>
  );
}
