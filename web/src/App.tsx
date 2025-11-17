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
import RangePracticePage from "./pages/RangePracticePage";
import RangeScorePage from "./pages/range/score";
import LiveRoundRoute from "./routes/live/[eventId]/[roundId]";
import CreateEventPage from "./pages/events/new";
import JoinEventPage from "./pages/join/[code]";
import QuickRoundStartPage from "./pages/quick/QuickRoundStartPage";
import QuickRoundPlayPage from "./pages/quick/QuickRoundPlayPage";
import CourseDemoPage from "./pages/courses/CourseDemoPage";
import LiveLeaderboardPage from "./pages/events/[id]/live";
import EventClipsAdminQueue from "./pages/events/[id]/admin/clips";
import EventClipModerationPage from "./pages/events/[id]/admin/moderation";
import EventLiveHostPage from "./pages/events/[id]/live-host";
import EventLiveViewerPage from "./pages/events/[id]/live-view";
import LiveViewerPage from "./pages/events/LiveViewerPage";
import EventTopShotsPage from "./pages/events/[id]/top-shots";
import HomeFeed from "./pages/home/HomeFeed";
import { HomeHubPage } from "@/pages/home/HomeHubPage";
import { EventSessionBoundary } from "./session/EventSessionBoundary";
import { useCdnPreconnect } from "./media/cdn";
import { PlayerOverlay } from "@web/player/PlayerOverlay";
import MyBagPage from "./pages/bag/MyBagPage";
import MyGolfIQPage from "./pages/profile/MyGolfIQPage";
import TripStartPage from "./pages/trip/TripStartPage";
import TripScoreboardPage from "./pages/trip/TripScoreboardPage";
import PublicTripScoreboardPage from "./pages/trip/PublicTripScoreboardPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";

export default function App() {
  useCdnPreconnect();
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6">
        <Routes>
          <Route path="/" element={<HomeHubPage />} />
          <Route path="/feed" element={<HomeFeed />} />
          <Route path="/analyze" element={<AnalyzePage />} />
          <Route path="/calibration" element={<CalibrationPage />} />
          <Route path="/mock" element={<MockAnalyzePage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/runs/:id" element={<RunDetailPage />} />
          <Route path="/share/:id" element={<ShareRunPage />} />
          <Route path="/event/:id" element={<EventLeaderboardPage />} />
          <Route path="/events/new" element={<CreateEventPage />} />
          <Route
            path="/events/:id/live"
            element={
              <EventSessionBoundary>
                <LiveViewerPage />
              </EventSessionBoundary>
            }
          />
          <Route
            path="/events/:id/live/leaderboard"
            element={
              <EventSessionBoundary>
                <LiveLeaderboardPage />
              </EventSessionBoundary>
            }
          />
          <Route
            path="/events/:id/live-host"
            element={
              <EventSessionBoundary>
                <EventLiveHostPage />
              </EventSessionBoundary>
            }
          />
          <Route
            path="/events/:id/live-view"
            element={
              <EventSessionBoundary>
                <EventLiveViewerPage />
              </EventSessionBoundary>
            }
          />
          <Route
            path="/events/:id/admin/clips"
            element={
              <EventSessionBoundary>
                <EventClipsAdminQueue />
              </EventSessionBoundary>
            }
          />
          <Route
            path="/events/:id/admin/moderation"
            element={
              <EventSessionBoundary>
                <EventClipModerationPage />
              </EventSessionBoundary>
            }
          />
          <Route
            path="/events/:id/top-shots"
            element={
              <EventSessionBoundary>
                <EventTopShotsPage />
              </EventSessionBoundary>
            }
          />
          <Route path="/join" element={<JoinEventPage />} />
          <Route path="/join/:code" element={<JoinEventPage />} />
          <Route path="/:eventId/live/:roundId" element={<LiveRoundRoute />} />
          <Route path="/field-runs" element={<FieldRunsPage />} />
          <Route path="/device-dashboard" element={<DeviceDashboardPage />} />
          <Route path="/accuracy" element={<AccuracyDashboardPage />} />
          <Route path="/admin/feedback" element={<FeedbackAdminPage />} />
          <Route path="/reels" element={<ReelsComposerPage />} />
          <Route path="/range/practice" element={<RangePracticePage />} />
          <Route path="/range/score" element={<RangeScorePage />} />
          <Route path="/profile" element={<MyGolfIQPage />} />
          <Route path="/bag" element={<MyBagPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/courses/demo" element={<CourseDemoPage />} />
          <Route path="/play" element={<QuickRoundStartPage />} />
          <Route path="/play/:roundId" element={<QuickRoundPlayPage />} />
          <Route path="/trip/start" element={<TripStartPage />} />
          <Route path="/trip/:tripId" element={<TripScoreboardPage />} />
          <Route path="/trip/share/:token" element={<PublicTripScoreboardPage />} />
          {qaReplayEnabled && <Route path="/qa/replay" element={<ReplayAnalyzerPage />} />}
        </Routes>
      </main>
      <PlayerOverlay />
    </div>
  );
}
