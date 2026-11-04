// A shared package importing a shared *subpath* (@repro/hooks/media) that the consumer application
// never imports itself.
import { useAvatar } from '@repro/hooks/media';

export function renderTopbar() {
  return useAvatar('user');
}
