export default function WorkspaceSkeleton({ region }: { region: 'header' | 'canvas' }) {
  if (region === 'header') {
    return (
      <div className="workspace-skeleton workspace-skeleton--header" aria-hidden="true">
        <span className="workspace-skeleton__bar" />
        <span className="workspace-skeleton__bar workspace-skeleton__bar--short" />
      </div>
    );
  }

  return (
    <div
      className="workspace-skeleton workspace-skeleton--canvas"
      data-testid="workspace-canvas-skeleton"
      aria-hidden="true"
    >
      <span className="workspace-skeleton__card" />
      <span className="workspace-skeleton__card" />
      <span className="workspace-skeleton__card" />
    </div>
  );
}
