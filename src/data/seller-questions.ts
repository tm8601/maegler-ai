export type QuestionType = 'boolean' | 'text' | 'multiselect';

export interface Question {
  id: string;
  category: string;
  text: string;
  type: QuestionType;
  options?: string[]; // For multiselect
  followUpIfTrue?: string; // Follow-up question if answer is true/yes
  aiGenerated?: boolean;
}

export const standardSellerQuestions: Question[] = [
  // 1. Bygninger
  {
    id: "q_bldg_1",
    category: "Bygninger og Indretning",
    text: "Er du bekendt med bygninger eller indretninger på grunden, der ikke er lovligt opført?",
    type: "boolean",
    followUpIfTrue: "Beskriv venligst hvilke bygninger/indretninger det drejer sig om:"
  },
  {
    id: "q_bldg_2",
    category: "Bygninger og Indretning",
    text: "Har du kendskab til fejlagtige registreringer i BBR-meddelelsen?",
    type: "boolean",
    followUpIfTrue: "Hvad er forkert registreret?"
  },
  {
    id: "q_bldg_3",
    category: "Bygninger og Indretning",
    text: "Er du vidende om fejl, skader eller mangler ved ejendommen (f.eks. utætheder, fugt eller defekte installationer)?",
    type: "boolean",
    followUpIfTrue: "Beskriv venligst fejlene og hvor de er placeret:"
  },

  // 2. Installationer
  {
    id: "q_inst_1",
    category: "Installationer",
    text: "Findes der gulvvarme i nogen af boligens rum?",
    type: "boolean",
    followUpIfTrue: "I hvilke rum er der gulvvarme, og fungerer det optimalt?"
  },
  {
    id: "q_inst_2",
    category: "Installationer",
    text: "Har ejendommen solceller eller andre vedvarende energikilder installeret?",
    type: "boolean"
  },
  {
    id: "q_inst_3",
    category: "Installationer",
    text: "Hvilken primær varmekilde benyttes i boligen?",
    type: "multiselect",
    options: ["Fjernvarme", "Varmepumpe", "Naturgas", "Oliefyr", "Elvarme", "Jordvarme", "Brændeovn/Pillefyr", "Andet"]
  },

  // 3. Grunden
  {
    id: "q_grnd_1",
    category: "Grunden",
    text: "Har du viden om jordforurening på matriklen?",
    type: "boolean",
    followUpIfTrue: "Uddyb venligst hvilken type forurening der er tale om:"
  },
  {
    id: "q_grnd_2",
    category: "Grunden",
    text: "Findes der en afblændet eller ubenyttet olietank på grunden?",
    type: "boolean",
    followUpIfTrue: "Hvor er tanken placeret, og har du dokumentation for sløjfningen?"
  },
  {
    id: "q_grnd_3",
    category: "Grunden",
    text: "Er ejendommen separatkloakeret?",
    type: "multiselect",
    options: ["Ja, fuldt ud", "Delvist", "Nej", "Ved ikke"]
  },
  {
    id: "q_grnd_4",
    category: "Grunden",
    text: "Kender du til uoverensstemmelser mellem skel/hæk og matrikelkortet?",
    type: "boolean"
  },

  // 4. Øvrige forhold
  {
    id: "q_othr_1",
    category: "Øvrige forhold",
    text: "Er der tinglyst medlemskab af en grundejerforening?",
    type: "boolean"
  },
  {
    id: "q_othr_2",
    category: "Øvrige forhold",
    text: "Er du vidende om planlagte projekter i nærområdet, der kan påvirke ejendommen (f.eks. vejprojekter, vindmøller)?",
    type: "boolean",
    followUpIfTrue: "Beskriv venligst hvad du har hørt om:"
  }
];
