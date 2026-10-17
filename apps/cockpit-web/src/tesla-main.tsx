import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { E2ePage } from './e2e/E2ePage'
import { TeslaExperience } from './components/automotive/tesla/TeslaExperience'
import './styles/index.css'

// Independent entry point. The original SU7 entry and its default dashboard stay unchanged.
const playground = new URLSearchParams(location.search).get('mode') === 'playground'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {playground ? <TeslaExperience /> : <E2ePage dashboard={<TeslaExperience />} fixedArtboard />}
  </StrictMode>,
)
