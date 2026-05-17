const text1 = `[17/05, 5:36 pm] Zaid Ali Shah: Hello
[17/05, 5:37 pm] Ghazanfar Octa: Hi`;

const text2 = `17/05/2026, 5:36 pm - Zaid Ali Shah: Hello
17/05/2026, 5:37 pm - Ghazanfar Octa: Hi`;

const text3 = `Zaid Ali Shah: Hello
Ghazanfar Octa: Hi`;

const text4 = `[17/05, 5:36 pm] Zaid Ali Shah: This has a hyphen - and a bracket ] in message!
[17/05, 5:37 pm] Zaid Ali Shah: Another message with : colon
[17/05, 5:37 pm] Ghazanfar Octa: Han ye Mai rat Mai kr dyta hu`;

const regex = /^(?:\[[^\]]+\]\s*|\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:am|pm)?\s*-\s*)?([^:\n]+):/gm;

function parse(text) {
  const names = new Set();
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) names.add(match[1].trim());
  }
  return Array.from(names);
}

console.log("Text 1:", parse(text1));
console.log("Text 2:", parse(text2));
console.log("Text 3:", parse(text3));
console.log("Text 4:", parse(text4));
