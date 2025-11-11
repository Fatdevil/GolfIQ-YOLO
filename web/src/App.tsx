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
import LiveRoundRoute from "./routes/live/[eventId]/[roundId]";
import CreateEventPage from "./pages/events/new";
import JoinEventPage from "./pages/join/[code]";
import LiveLeaderboardPage from "./pages/events/[id]/live";
import EventClipsAdminQueue from "./pages/events/[id]/admin/clips";
import EventClipModerationPage from "./pages/events/[id]/admin/moderation";
import EventLiveHostPage from "./pages/events/[id]/live-host";
import EventLiveViewerPage from "./pages/events/[id]/live-view";
import EventTopShotsPage from "./pages/events/[id]/top-shots";

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
          <Route path="/events/new" element={<CreateEventPage />} />
          <Route path="/events/:id/live" element={<LiveLeaderboardPage />} />
          <Route path="/events/:id/live-host" element={<EventLiveHostPage />} />
          <Route path="/events/:id/live-view" element={<EventLiveViewerPage />} />
          <Route path="/events/:id/admin/clips" element={<EventClipsAdminQueue />} />
          <Route path="/events/:id/admin/moderation" element={<EventClipModerationPage />} />
          <Route path="/events/:id/top-shots" element={<EventTopShotsPage />} />
          <Route path="/join" element={<JoinEventPage />} />
          <Route path="/join/:code" element={<JoinEventPage />} />
          <Route path="/:eventId/live/:roundId" element={<LiveRoundRoute />} />
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
