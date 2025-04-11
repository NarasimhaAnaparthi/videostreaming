import './App.css';
import Host from './Host';
import Viewer from './Viewer';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import process from 'process';
import LandingPage from './LandingPage';
function App() {
  window.process = process;

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/host/:streamId" element={<Host />} />
        <Route path="/view/:streamId" element={<Viewer />} />
      </Routes>
    </Router>
  );
}

export default App;
