import { ArrowRight, ArrowUpRight, Languages, Mic, Users } from "lucide-react";
import { useEffect } from "react";
import { activities } from "../shared/activities";
import "./activity-hub.css";

export default function ActivityHub() {
  useEffect(() => {
    document.title = "Meg’s classroom · English activities";
  }, []);
  return (
    <div className="activity-hub">
      <header className="hub-header">
        <a className="hub-brand" href="/">
          Meg’s classroom
        </a>
        <a className="hub-teacher" href="/teacher">
          Teacher desk <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </header>
      <main>
        <section className="hub-intro">
          <h1 id="hub-title">Speaking activities for pairs</h1>
        </section>
        <ol className="hub-list" aria-labelledby="hub-title">
          {activities.map((activity, index) => (
            <li className="hub-entry" key={activity.id}>
              <span className="hub-number" aria-hidden="true">
                {index + 1}
              </span>
              <figure className="hub-plate">
                <img
                  src={activity.image}
                  alt={activity.imageAlt}
                  width={1536}
                  height={1024}
                  fetchPriority={index === 0 ? "high" : "auto"}
                />
              </figure>
              <div className="hub-entry-text">
                <p className="hub-kicker">{activity.category}</p>
                <h2>
                  <a href={activity.path}>{activity.title}</a>
                </h2>
                <p className="hub-description">{activity.description}</p>
                <ul className="hub-facts">
                  <li>
                    <Users size={16} aria-hidden="true" />
                    {activity.players}
                  </li>
                  <li>
                    <Languages size={16} aria-hidden="true" />
                    {activity.language}
                  </li>
                  <li>
                    <Mic size={16} aria-hidden="true" />
                    {activity.modes}
                  </li>
                </ul>
                <a className="hub-open" href={activity.path}>
                  Open <ArrowRight size={18} aria-hidden="true" />
                </a>
                <p className="hub-return">
                  Already playing? Use your private link.
                </p>
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
