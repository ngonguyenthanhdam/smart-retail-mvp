import { cookies } from 'next/headers';
import { getMessages } from './messages';
import { localeCookie, resolveLocale } from './types';

export async function getLocale() {
  return resolveLocale((await cookies()).get(localeCookie)?.value);
}
export async function getServerMessages() {
  return getMessages(await getLocale());
}
