window.global = window // fix "global is not defined" error in react-image-lightbox

import ReactDOM from 'react-dom'
import './index.css'
import App from './App'
import config from './config'

// A versioned URL bypasses an older worker cached by the CDN after deploys.
if ('serviceWorker' in navigator) {
  const workerUrl = new URL('./sw.js', document.baseURI)
  workerUrl.searchParams.set('version', config.version)
  navigator.serviceWorker
    .register(workerUrl.href, { scope: './', updateViaCache: 'none' })
    .catch((error) =>
      console.error('Service worker registration failed', error),
    )
}

ReactDOM.render(<App />, document.getElementById('root'))
