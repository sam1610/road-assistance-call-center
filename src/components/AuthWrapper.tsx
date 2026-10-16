import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

interface AuthWrapperProps {
  children?: React.ReactNode;
}

/**
 * Wraps the application in Amplify's Authenticator with both email and
 * phone number login mechanisms configured.
 *
 * Requirements: Design — Frontend Components
 */
export default function AuthWrapper({ children }: AuthWrapperProps) {
  return (
    <Authenticator loginMechanisms={['email', 'phone_number']}>
      {() => <>{children}</>}
    </Authenticator>
  );
}
