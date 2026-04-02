import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import WizardApp from './WizardApp.jsx'

createRoot(document.getElementById('wizard-root')).render(
  <StrictMode>
    <WizardApp />
  </StrictMode>,
)
