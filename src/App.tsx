import { SelectMedia } from './ui/screens/SelectMedia';

export function App() {
  return (
    <main className="app">
      <h1>SoftView</h1>
      <p className="tagline">
        A privacy-first media viewer that helps soften potentially intense audio and visual moments.
      </p>

      <p className="disclaimer" role="note">
        SoftView&rsquo;s analysis is a heuristic estimate. It may miss moments or flag moments that
        are not intense for you. SoftView does not determine whether media is safe, and is not a
        medical device. Your media is analyzed on your device and is never uploaded.
      </p>

      <SelectMedia />
    </main>
  );
}
