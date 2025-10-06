import { Route, Routes } from "react-router-dom";
import AnalyzePage from "./pages/Analyze";
import CalibrationPage from "./pages/Calibration";
import MockAnalyzePage from "./pages/MockAnalyze";
import RunsPage from "./pages/Runs";
import RunDetailPage from "./pages/RunDetail";
import DeviceDashboardPage from "./pages/DeviceDashboard";
import FieldRunsPage from "./pages/FieldRuns";
import AccuracyBoardPage from "./pages/AccuracyBoard";
import FeedbackAdminPage from "./pages/FeedbackAdmin";
import Nav from "./components/Nav";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6">
        <Routes>
          <Route path="/" element={<AnalyzePage />} />
          <Route path="/calibration" element={<CalibrationPage />} />
          <Route path="/mock" element={<MockAnalyzePage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/runs/:id" element={<RunDetailPage />} />
          <Route path="/field-runs" element={<FieldRunsPage />} />
          <Route path="/device-dashboard" element={<DeviceDashboardPage />} />
          <Route path="/accuracy" element={<AccuracyBoardPage />} />
          <Route path="/admin/feedback" element={<FeedbackAdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
