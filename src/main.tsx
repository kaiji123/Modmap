import {StrictMode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import App from './App';
import './style.css';

const container=document.getElementById('root')!;
// Keep one root across entry-module hot updates; data updates only reconcile App.
const root:Root=import.meta.hot?.data.root??createRoot(container);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<StrictMode><App/></StrictMode>);
