import { ArrowUpRight, Compass, MessageCircle, Users } from "lucide-react";
import { useEffect } from "react";
import { activities } from "../shared/activities";
import "./activity-hub.css";

export default function ActivityHub() {
  useEffect(() => {
    document.title = "Meg’s classroom · English through stories and play";
  }, []);
  return (
    <div className="activity-hub">
      <header className="hub-header">
        <a className="hub-brand" href="/" aria-label="Meg's classroom home">
          <span className="hub-monogram">m.</span>
          <span>
            Meg’s classroom<small>ENGLISH ACTIVITIES</small>
          </span>
        </a>
        <a className="hub-navigation" href="#activities">
          Explore activities <ArrowUpRight size={16} />
        </a>
      </header>
      <main>
        <section className="hub-intro" aria-labelledby="hub-title">
          <span className="hub-index">01 / THE COLLECTION</span>
          <h1 id="hub-title">
            English, through
            <br />
            <em>stories and play.</em>
          </h1>
          <p>
            Choose an activity. Work with a partner.
            <br />
            Use English to make your next move.
          </p>
        </section>
        <section
          id="activities"
          className="hub-activities"
          aria-labelledby="activities-title"
        >
          <div className="hub-section-label">
            <h2 id="activities-title">Activities</h2>
            <span>
              {activities.length.toString().padStart(2, "0")} AVAILABLE
            </span>
          </div>
          {activities.map((activity, index) => (
            <article className="hub-activity" key={activity.id}>
              <a
                className="hub-art-link"
                href={activity.path}
                aria-label={`Open ${activity.title}`}
              >
                <img
                  src={activity.image}
                  alt={activity.imageAlt}
                  fetchPriority="high"
                />
                <span className="hub-art-label">
                  FIELD NOTES / {String(index + 1).padStart(2, "0")}
                </span>
              </a>
              <div className="hub-activity-copy">
                <span className="hub-category">{activity.category}</span>
                <h3>
                  <a href={activity.path}>{activity.title}</a>
                </h3>
                <p>{activity.description}</p>
                <ul className="hub-facts" aria-label="Activity details">
                  <li>
                    <Users size={16} />
                    {activity.players}
                  </li>
                  <li>
                    <MessageCircle size={16} />
                    {activity.language}
                  </li>
                  <li>
                    <Compass size={16} />
                    {activity.modes}
                  </li>
                </ul>
                <a className="hub-launch" href={activity.path}>
                  Open the adventure <ArrowUpRight size={19} />
                </a>
                <small className="hub-invitation">
                  One person hosts. Their partner joins by private invitation.
                </small>
              </div>
            </article>
          ))}
        </section>
        <aside className="hub-next">
          <span className="hub-index">A GROWING COLLECTION</span>
          <p>
            This is the first activity in Meg’s classroom.
            <br />
            New activities will appear here.
          </p>
        </aside>
      </main>
      <footer className="hub-footer">
        <span>Meg’s classroom</span>
        <span>Made for conversation.</span>
      </footer>
    </div>
  );
}
