import { Route, Routes } from "react-router-dom";
import AnalyzePage from "./pages/Analyze";
import CalibrationPage from "./pages/Calibration";
import MockAnalyzePage from "./pages/MockAnalyze";
import RunsPage from "./pages/Runs";
import RunDetailPage from "./pages/RunDetail";
import DeviceDashboardPage from "./pages/DeviceDashboard";
import FieldRunsPage from "./pages/FieldRuns";
import AccuracyDashboardPage from "./pages/accuracy";
import FeedbackAdminPage from "./pages/FeedbackAdmin";
import ReplayAnalyzerPage from "./pages/ReplayAnalyzer";
import Nav from "./components/Nav";
import { qaReplayEnabled } from "./config";
import ShareRunPage from "./pages/ShareRun";
import EventLeaderboardPage from "./pages/EventLeaderboard";
import ReelsComposerPage from "./pages/ReelsComposer";
import RangeScorePage from "./pages/range/score";

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
          <Route path="/share/:id" element={<ShareRunPage />} />
          <Route path="/event/:id" element={<EventLeaderboardPage />} />
          <Route path="/field-runs" element={<FieldRunsPage />} />
          <Route path="/device-dashboard" element={<DeviceDashboardPage />} />
          <Route path="/accuracy" element={<AccuracyDashboardPage />} />
          <Route path="/admin/feedback" element={<FeedbackAdminPage />} />
          <Route path="/reels" element={<ReelsComposerPage />} />
          <Route path="/range/score" element={<RangeScorePage />} />
          {qaReplayEnabled && <Route path="/qa/replay" element={<ReplayAnalyzerPage />} />}
        </Routes>
      </main>
    </div>
  );
}
