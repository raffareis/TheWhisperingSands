import { ArrowRight, ArrowUpRight } from "lucide-react";
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
          <h1 id="hub-title">Activities for speaking English in pairs</h1>
          <p>
            Each activity is played by two students, in English, across one or
            more lessons. Your teacher sends each of you a private link; it
            always brings you back to where you stopped.
          </p>
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
                <dl className="hub-facts">
                  <div>
                    <dt>Players</dt>
                    <dd>{activity.players}</dd>
                  </div>
                  <div>
                    <dt>Language</dt>
                    <dd>{activity.language}</dd>
                  </div>
                  <div>
                    <dt>Play by</dt>
                    <dd>{activity.modes}</dd>
                  </div>
                </dl>
                <a className="hub-open" href={activity.path}>
                  Open the activity <ArrowRight size={18} aria-hidden="true" />
                </a>
                <p className="hub-return">
                  Already playing? Open your private link instead. It returns
                  you to your own seat.
                </p>
              </div>
            </li>
          ))}
        </ol>
        {activities.length === 1 && (
          <p className="hub-later">
            {activities[0].title} is the first activity here. New ones will be
            added to this list.
          </p>
        )}
      </main>
      <footer className="hub-footer">
        Meg’s classroom · English activities
      </footer>
    </div>
  );
}
