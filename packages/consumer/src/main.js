// The application imports the package roots @repro/lib and @repro/hooks,
// but never the subpath @repro/hooks/media, which only @repro/lib uses.
import { useGreeting } from '@repro/hooks';
import { renderTopbar } from '@repro/lib';

document.querySelector('#app').textContent = `${useGreeting()}: ${renderTopbar()}`;
