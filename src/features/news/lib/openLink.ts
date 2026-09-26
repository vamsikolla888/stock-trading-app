import { Linking } from 'react-native';

import { toast } from '@/lib/utils/toast';

import { isWebLink } from './news';

/** Opens an article's original page in the browser; never hands a non-web URL to the OS. */
export async function openArticleLink(link: string | null | undefined): Promise<void> {
  if (!isWebLink(link)) {
    toast.error('No link for this article');
    return;
  }
  try {
    await Linking.openURL(link.trim());
  } catch {
    toast.error('Couldn’t open the article');
  }
}
