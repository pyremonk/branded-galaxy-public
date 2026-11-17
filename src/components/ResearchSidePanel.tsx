/**
 * ResearchSidePanel — Research side panel accessible via InfoNavHUD.
 *
 * Embeds ResearchProgressHUD (active research), ResearchQueue (queued techs),
 * and TechTree (inline) inside the shared InfoPanelFrame shell.
 *
 * Props:
 *   factionId    {string}
 *   onClose      {Function}
 *   onSelectTech {Function}  Called with (tech, nodeState, activeProject) when a tree node is clicked
 */
import ResearchProgressHUD from './ResearchProgressHUD';
import ResearchQueue from './ResearchQueue';
import TechTree from './TechTree';
import { InfoPanelFrame } from './InfoPanelFrame';
import './ResearchSidePanel.css';

export function ResearchSidePanel({ factionId, onClose, onSelectTech }: any) {
  if (!factionId) return null;

  return (
    <InfoPanelFrame
      panelId="research"
      title="Research"
      subtitle="Tech queue & active projects"
      onClose={onClose}
      className="research-side-panel"
    >
      {/* Active research progress */}
      <section className="research-panel-section">
        <h3 className="research-panel-section-title">Active Research</h3>
        <ResearchProgressHUD factionId={factionId} />
      </section>

      {/* Research queue */}
      <section className="research-panel-section">
        <h3 className="research-panel-section-title">Queue</h3>
        <ResearchQueue factionId={factionId} />
      </section>

      {/* Inline tech tree */}
      <section className="research-panel-section research-panel-section--tree">
        <h3 className="research-panel-section-title">Tech Tree</h3>
        <TechTree
          factionId={factionId}
          inline={true}
          onSelectTech={onSelectTech}
        />
      </section>
    </InfoPanelFrame>
  );
}
