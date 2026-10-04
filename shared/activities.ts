// Public classroom catalogue. Future activities add a route and an entry here.
// No campaign evidence, solutions or private classroom state belongs in this list.
export const activities = [
  {
    id: "whispering-sands",
    path: "/whispering-sands",
    title: "The Whispering Sands",
    category: "A cooperative island mystery",
    description:
      "Shipwrecked on an unfamiliar island, compare private clues, solve puzzles and find your way home with an AI storyteller.",
    image: "/art/coastal-field-study-sunburst.webp",
    imageAlt: "A painted coastal expedition study in sand and sea-green tones",
    players: "Two players",
    language: "English",
    modes: "Voice or text",
  },
] as const;
