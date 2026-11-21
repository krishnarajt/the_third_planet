import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import PwaUpdate from './components/PwaUpdate';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Play from './pages/Play';
import Scores from './pages/Scores';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore/:scope" element={<Explore />} />
          <Route path="/play/:mode/:category/:scope" element={<Play />} />
          <Route path="/scores" element={<Scores />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <PwaUpdate />
      </ToastProvider>
    </BrowserRouter>
  );
}
