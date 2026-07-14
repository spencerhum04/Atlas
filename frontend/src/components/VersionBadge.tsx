import './VersionBadge.css';

export default function VersionBadge() {
  return (
    <div className="fixed top-5 left-5 z-30">
      <div className="version-badge">
        <span className="version-badge__sparkle" />
        v1.1
      </div>
    </div>
  );
}
