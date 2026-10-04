// Public classroom catalogue. Future activities add a route and an entry here.
// No campaign evidence, solutions or private classroom state belongs in this list.
export const activities = [
  {
    id: "whispering-sands",
    path: "/whispering-sands",
    title: "The Whispering Sands",
    category: "A cooperative island mystery",
    description:
      "Two castaways, two private clues and an AI storyteller. Solve it by talking in English.",
    image: "/art/coastal-field-study-sunburst.webp",
    imageAlt: "A painted coastal expedition study in sand and sea-green tones",
    players: "Two players",
    language: "English",
    modes: "Voice or text",
  },
] as const;
