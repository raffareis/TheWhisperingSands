import { ArrowUpRight } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { guideImages } from "./guide-images";
import "./guide.css";

// Teacher guide with real screenshots from a synthetic pair (Bruno & Ana).
// Private evidence, hints and answers are blurred in every capture.
type Step = { shots: string[]; text: ReactNode };
type Section = { id: string; title: string; steps: Step[] };

const B = ({ children }: { children: ReactNode }) => (
  <strong className="guide-button">{children}</strong>
);

const sections: Section[] = [
  {
    id: "before-class",
    title: "Before class",
    steps: [
      {
        shots: ["01-portal"],
        text: (
          <>
            Open <strong>meg.raffareis.com</strong> and choose{" "}
            <B>Teacher desk</B>.
          </>
        ),
      },
      {
        shots: ["02-host-code"],
        text: (
          <>
            Type your private host code and press <B>Unlock</B>. Only you need
            this code; students never use it.
          </>
        ),
      },
      {
        shots: ["03-new-pair-button"],
        text: (
          <>
            Press <B>New pair</B>.
          </>
        ),
      },
      {
        shots: ["04-new-pair-form"],
        text: (
          <>
            Write who plays <strong>Sam</strong> and who plays{" "}
            <strong>Liz</strong>, an adventure name, the class and the next
            lesson. <strong>Private notes</strong> are only for you.
          </>
        ),
      },
      {
        shots: ["05-pair-created"],
        text: (
          <>
            Press <B>Create pair</B>. You are not a player: the two seats are
            reserved for the students.
          </>
        ),
      },
      {
        shots: ["06-copy-links", "07-links-help"],
        text: (
          <>
            In <strong>Private student links</strong>, press <B>Copy link</B>{" "}
            and send each student their own link (WhatsApp, e-mail…). The link
            works every lesson, on any device. Never send one link to both
            students.
          </>
        ),
      },
    ],
  },
  {
    id: "first-lesson",
    title: "The first lesson",
    steps: [
      {
        shots: ["08-student-link-desktop", "09-student-link-phone"],
        text: (
          <>
            Each student opens their own link, on a computer or a phone. Here
            Bruno plays Sam on a laptop and Ana plays Liz on her phone.
          </>
        ),
      },
      {
        shots: ["10-both-here"],
        text: (
          <>
            When both names have a green dot, either student presses{" "}
            <B>Begin adventure</B>.
          </>
        ),
      },
      {
        shots: ["12-voice-and-text"],
        text: (
          <>
            The storyteller sets the scene. For voice, both students press{" "}
            <B>Enable voice</B>, tap the microphone to speak and tap again to
            finish.
          </>
        ),
      },
      {
        shots: ["13-ask-storyteller"],
        text: (
          <>
            Or they type in <strong>Ask the storyteller</strong>: actions and
            questions, always in English.
          </>
        ),
      },
    ],
  },
  {
    id: "working-together",
    title: "Working together",
    steps: [
      {
        shots: ["14-evidence-sam", "15-evidence-liz"],
        text: (
          <>
            <strong>Evidence</strong>: each student sees a different private
            record. Nobody can open the lock alone; they describe their records
            to each other in English.
          </>
        ),
      },
      {
        shots: ["16-talk-phone", "17-talk-desktop"],
        text: (
          <>
            <strong>Talk</strong> is a private chat for the pair. The
            storyteller does not read it. <strong>Useful phrases</strong> help
            them start.
          </>
        ),
      },
      {
        shots: ["18-roll-request", "19-roll-setback"],
        text: (
          <>
            For physical actions the storyteller may ask for a die roll. Only
            the named player presses <B>Roll D6</B>. The server rolls, not the
            AI. After a setback: <B>Accept setback</B>, or <B>Push your luck</B>{" "}
            (one new try for 1 HP).
          </>
        ),
      },
      {
        shots: ["20-hint", "21-wrong-answer"],
        text: (
          <>
            Stuck? <B>Reveal hint</B> gives up to three hints per lock. Hints
            and wrong answers never cost HP.
          </>
        ),
      },
      {
        shots: ["22-one-lock", "23-both-locks"],
        text: (
          <>
            Each student types their own answer and presses <B>Try answer</B>.
            When both locks are accepted, the discovery is recorded.
          </>
        ),
      },
      {
        shots: ["24-next-chapter", "25-clues"],
        text: (
          <>
            They tell the storyteller to continue: a new chapter and a new
            illustration. <strong>Clues</strong> keeps every discovery;{" "}
            <strong>Story</strong> and <strong>Full log</strong> keep the
            conversation.
          </>
        ),
      },
    ],
  },
  {
    id: "end-of-lesson",
    title: "End of the lesson",
    steps: [
      {
        shots: ["26-desk-progress"],
        text: (
          <>
            During the lesson, <B>Refresh progress</B> shows the story so far,
            solved locks, hints and attempts.
          </>
        ),
      },
      {
        shots: ["27-notes"],
        text: (
          <>
            Write <strong>Private notes</strong> and the{" "}
            <strong>Next lesson</strong> date, then press <B>Save</B>. Students
            and the AI never see your notes.
          </>
        ),
      },
      {
        shots: ["28-paused-desk", "29-paused-student"],
        text: (
          <>
            Press <B>Pause lesson</B>. Voice closes and no new turns are taken.
            Students see the lesson is paused; everything is saved.
          </>
        ),
      },
    ],
  },
  {
    id: "next-week",
    title: "Next week",
    steps: [
      {
        shots: ["30-reopen", "31-back-in-game"],
        text: (
          <>
            Choose the pair and press <B>Reopen</B>. Students open the same
            links and continue where they stopped. They press{" "}
            <B>Enable voice</B> again if they want voice.
          </>
        ),
      },
    ],
  },
  {
    id: "to-the-end",
    title: "To the end",
    steps: [
      {
        shots: ["32-chapter-3", "33-chapter-4", "34-chapter-5"],
        text: (
          <>
            Five chapters, five locks. Every lock needs both students. Repeat:
            describe, answer, continue.
          </>
        ),
      },
      {
        shots: ["35-last-lock", "36-final-choice"],
        text: (
          <>
            The last lock calls the rescue ferry. At the pier the pair chooses
            freely: confront, forgive or leave the keeper. Every choice takes
            them home.
          </>
        ),
      },
      {
        shots: ["37b-ending-scene", "38-ending-phone"],
        text: (
          <>
            The end: the family boards the ferry, on both devices. The adventure
            is complete.
          </>
        ),
      },
    ],
  },
  {
    id: "after",
    title: "After the adventure",
    steps: [
      {
        shots: ["39-desk-complete"],
        text: <>The desk shows the pair as completed, 5 of 5.</>,
      },
      {
        shots: ["40-archived"],
        text: (
          <>
            <B>Archive</B> moves the pair out of Current. Choose{" "}
            <strong>Show › Archived</strong> to find it again. Nothing is
            deleted, and <B>Reopen</B> brings it back.
          </>
        ),
      },
      {
        shots: ["41-replace-link"],
        text: (
          <>
            Link lost or shared? <B>Replace link</B> disables the old one. Send
            the new link to that student only.
          </>
        ),
      },
      {
        shots: ["42-lock-desk"],
        text: (
          <>
            On a shared computer, press <B>Lock desk</B> when you finish.
          </>
        ),
      },
    ],
  },
];

function Shot({ id }: { id: string }) {
  const [width, height] = guideImages[id] ?? [1100, 688];
  return (
    <img
      className={height > width ? "guide-shot phone" : "guide-shot"}
      src={`/guide/${id}.webp`}
      width={width}
      height={height}
      loading="lazy"
      alt=""
    />
  );
}

export default function Guide() {
  useEffect(() => {
    document.title = "Teacher guide · The Whispering Sands";
  }, []);
  let n = 0;
  return (
    <div className="guide">
      <header className="guide-header">
        <a className="guide-brand" href="/">
          Meg’s classroom
        </a>
        <a href="/teacher">
          Teacher desk <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </header>
      <main>
        <h1>Teacher guide</h1>
        <p className="guide-lead">
          The Whispering Sands, from a new pair to the last chapter.
        </p>
        <video
          className="guide-video"
          controls
          playsInline
          preload="metadata"
          poster="/guide/teacher-guide-poster.webp"
          width={1920}
          height={1080}
        >
          <source src="/guide/teacher-guide.mp4" type="video/mp4" />
        </video>
        <nav className="guide-contents" aria-label="Guide sections">
          {sections.map((s, i) => (
            <a key={s.id} href={`#${s.id}`}>
              <span>{String(i + 1).padStart(2, "0")}</span> {s.title}
            </a>
          ))}
        </nav>
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
            <h2 id={`${s.id}-title`}>
              <span>{String(i + 1).padStart(2, "0")}</span> {s.title}
            </h2>
            <ol className="guide-steps" start={n + 1}>
              {s.steps.map((step) => {
                n += 1;
                return (
                  <li key={step.shots[0]}>
                    <span className="guide-step-number" aria-hidden="true">
                      {n}
                    </span>
                    <p>{step.text}</p>
                    <div className={`guide-shots count-${step.shots.length}`}>
                      {step.shots.map((id) => (
                        <Shot key={id} id={id} />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        <section aria-labelledby="good-to-know">
          <h2 id="good-to-know">Good to know</h2>
          <dl className="guide-facts">
            <div>
              <dt>Student link</dt>
              <dd>
                From your desk. Works every week, on any device. Opening it on a
                new device signs out the old one.
              </dd>
            </div>
            <div>
              <dt>Return link</dt>
              <dd>
                In the game, <strong>Table settings</strong> makes a one-time
                link that lasts 15 minutes, to move a seat to another device.
              </dd>
            </div>
            <div>
              <dt>Voice</dt>
              <dd>
                The pair hears the same storyteller. Students can interrupt the
                narration. After a pause or a server restart, press{" "}
                <B>Enable voice</B> again.
              </dd>
            </div>
            <div>
              <dt>Illustrations</dt>
              <dd>
                Pictures appear when ready; the story continues meanwhile. They
                can be paused in <strong>Table settings</strong>.
              </dd>
            </div>
            <div>
              <dt>Privacy</dt>
              <dd>
                Your notes and the pair’s Talk chat are never sent to the
                storyteller.
              </dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  );
}
