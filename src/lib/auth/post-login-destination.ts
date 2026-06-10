/**
 * Decides where a user lands after a successful sign-in: admins go to the
 * admin hub, everyone else to the customer account area. Pure + isolated so
 * it can be unit-tested without the Logto callback machinery.
 */
export function postLoginDestination(roles: string[]): string {
  return roles.includes('admin') ? '/admin' : '/account'
}
