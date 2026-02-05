import jsPDF from 'jspdf';

/**
 * GetPawsy Complete Admin Handleiding PDF Generator
 * Nederlandse handleiding voor de webshop eigenaar
 * Versie 2.0 - Volledig herschreven met visuele verbeteringen
 */

const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 25;
const MARGIN_BOTTOM = 30;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_HEIGHT = 6.5;

let currentPage = 1;
let yPosition = MARGIN_TOP;

// Colors
const PRIMARY_COLOR: [number, number, number] = [79, 70, 229]; // Indigo
const SUCCESS_COLOR: [number, number, number] = [34, 197, 94]; // Green
const WARNING_COLOR: [number, number, number] = [234, 179, 8]; // Yellow
const DANGER_COLOR: [number, number, number] = [239, 68, 68]; // Red
const MUTED_COLOR: [number, number, number] = [107, 114, 128]; // Gray
const BOX_BG: [number, number, number] = [243, 244, 246]; // Light gray

const addPageNumber = (doc: jsPDF) => {
  doc.setFontSize(9);
  doc.setTextColor(...MUTED_COLOR);
  doc.text(`Pagina ${currentPage}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 12, { align: 'center' });
  doc.setFontSize(8);
  doc.text('GetPawsy Admin Handleiding', MARGIN_LEFT, PAGE_HEIGHT - 12);
  doc.setTextColor(0, 0, 0);
};

const checkPageBreak = (doc: jsPDF, neededSpace: number = 30) => {
  if (yPosition + neededSpace > PAGE_HEIGHT - MARGIN_BOTTOM) {
    addPageNumber(doc);
    doc.addPage();
    currentPage++;
    yPosition = MARGIN_TOP;
  }
};

const addTitle = (doc: jsPDF, text: string, fontSize: number = 22) => {
  checkPageBreak(doc, 45);
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text(text, MARGIN_LEFT, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += fontSize * 0.5 + 8;
};

const addSubtitle = (doc: jsPDF, text: string, fontSize: number = 13) => {
  checkPageBreak(doc, 25);
  yPosition += 4;
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(50, 50, 50);
  doc.text(text, MARGIN_LEFT, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += fontSize * 0.4 + 5;
};

const addParagraph = (doc: jsPDF, text: string, fontSize: number = 10.5) => {
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  
  for (const line of lines) {
    checkPageBreak(doc, LINE_HEIGHT + 5);
    doc.text(line, MARGIN_LEFT, yPosition);
    yPosition += LINE_HEIGHT;
  }
  doc.setTextColor(0, 0, 0);
  yPosition += 4;
};

const addTipBox = (doc: jsPDF, title: string, content: string) => {
  checkPageBreak(doc, 40);
  
  const boxHeight = Math.max(25, doc.splitTextToSize(content, CONTENT_WIDTH - 16).length * LINE_HEIGHT + 18);
  
  // Box background
  doc.setFillColor(236, 253, 245); // Light green
  doc.setDrawColor(...SUCCESS_COLOR);
  doc.roundedRect(MARGIN_LEFT, yPosition - 3, CONTENT_WIDTH, boxHeight, 3, 3, 'FD');
  
  // Title
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SUCCESS_COLOR);
  doc.text(`TIP: ${title}`, MARGIN_LEFT + 6, yPosition + 5);
  
  // Content
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const lines = doc.splitTextToSize(content, CONTENT_WIDTH - 16);
  let lineY = yPosition + 13;
  for (const line of lines) {
    doc.text(line, MARGIN_LEFT + 6, lineY);
    lineY += LINE_HEIGHT;
  }
  
  doc.setTextColor(0, 0, 0);
  yPosition += boxHeight + 6;
};

const addWarningBox = (doc: jsPDF, content: string) => {
  checkPageBreak(doc, 35);
  
  const lines = doc.splitTextToSize(content, CONTENT_WIDTH - 16);
  const boxHeight = Math.max(20, lines.length * LINE_HEIGHT + 12);
  
  // Box background
  doc.setFillColor(254, 252, 232); // Light yellow
  doc.setDrawColor(...WARNING_COLOR);
  doc.roundedRect(MARGIN_LEFT, yPosition - 3, CONTENT_WIDTH, boxHeight, 3, 3, 'FD');
  
  // Content
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 100, 20);
  doc.text('LET OP: ', MARGIN_LEFT + 6, yPosition + 5);
  doc.setFont('helvetica', 'normal');
  
  let lineY = yPosition + 5;
  const firstLine = lines[0];
  doc.text(firstLine, MARGIN_LEFT + 24, lineY);
  lineY += LINE_HEIGHT;
  
  for (let i = 1; i < lines.length; i++) {
    doc.text(lines[i], MARGIN_LEFT + 6, lineY);
    lineY += LINE_HEIGHT;
  }
  
  doc.setTextColor(0, 0, 0);
  yPosition += boxHeight + 6;
};

const addInfoBox = (doc: jsPDF, title: string, content: string) => {
  checkPageBreak(doc, 40);
  
  const lines = doc.splitTextToSize(content, CONTENT_WIDTH - 16);
  const boxHeight = Math.max(25, lines.length * LINE_HEIGHT + 18);
  
  // Box background
  doc.setFillColor(238, 242, 255); // Light indigo
  doc.setDrawColor(...PRIMARY_COLOR);
  doc.roundedRect(MARGIN_LEFT, yPosition - 3, CONTENT_WIDTH, boxHeight, 3, 3, 'FD');
  
  // Title
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text(title, MARGIN_LEFT + 6, yPosition + 5);
  
  // Content
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  let lineY = yPosition + 13;
  for (const line of lines) {
    doc.text(line, MARGIN_LEFT + 6, lineY);
    lineY += LINE_HEIGHT;
  }
  
  doc.setTextColor(0, 0, 0);
  yPosition += boxHeight + 6;
};

const addChecklistItem = (doc: jsPDF, text: string, isPositive: boolean) => {
  checkPageBreak(doc, 12);
  
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  
  if (isPositive) {
    doc.setTextColor(...SUCCESS_COLOR);
    doc.text('[OK]', MARGIN_LEFT, yPosition);
  } else {
    doc.setTextColor(...DANGER_COLOR);
    doc.text('[X]', MARGIN_LEFT + 1, yPosition);
  }
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(text, MARGIN_LEFT + 14, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += LINE_HEIGHT + 2;
};

const addIconExplanation = (doc: jsPDF, icon: string, name: string, meaning: string, actionNeeded: string, noAction: string) => {
  checkPageBreak(doc, 45);
  
  // Icon and name header
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text(`${icon}  ${name}`, MARGIN_LEFT, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += 8;
  
  // Meaning
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const meaningLines = doc.splitTextToSize(`Betekenis: ${meaning}`, CONTENT_WIDTH - 5);
  for (const line of meaningLines) {
    doc.text(line, MARGIN_LEFT + 3, yPosition);
    yPosition += LINE_HEIGHT;
  }
  yPosition += 2;
  
  // When action needed
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...SUCCESS_COLOR);
  doc.text('Actie nodig:', MARGIN_LEFT + 3, yPosition);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const actionLines = doc.splitTextToSize(actionNeeded, CONTENT_WIDTH - 35);
  doc.text(actionLines[0], MARGIN_LEFT + 30, yPosition);
  yPosition += LINE_HEIGHT;
  for (let i = 1; i < actionLines.length; i++) {
    doc.text(actionLines[i], MARGIN_LEFT + 30, yPosition);
    yPosition += LINE_HEIGHT;
  }
  
  // When no action needed
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MUTED_COLOR);
  doc.text('Geen actie:', MARGIN_LEFT + 3, yPosition);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  const noActionLines = doc.splitTextToSize(noAction, CONTENT_WIDTH - 35);
  doc.text(noActionLines[0], MARGIN_LEFT + 30, yPosition);
  yPosition += LINE_HEIGHT;
  for (let i = 1; i < noActionLines.length; i++) {
    doc.text(noActionLines[i], MARGIN_LEFT + 30, yPosition);
    yPosition += LINE_HEIGHT;
  }
  
  doc.setTextColor(0, 0, 0);
  yPosition += 6;
};

const addSpace = (doc: jsPDF, space: number = 10) => {
  yPosition += space;
  checkPageBreak(doc, 20);
};

const startNewPage = (doc: jsPDF) => {
  addPageNumber(doc);
  doc.addPage();
  currentPage++;
  yPosition = MARGIN_TOP;
};

const addBulletPoint = (doc: jsPDF, text: string, indent: number = 0) => {
  checkPageBreak(doc, 12);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  
  const bulletX = MARGIN_LEFT + indent;
  doc.text('•', bulletX, yPosition);
  
  const textLines = doc.splitTextToSize(text, CONTENT_WIDTH - indent - 8);
  doc.text(textLines[0], bulletX + 6, yPosition);
  yPosition += LINE_HEIGHT;
  
  for (let i = 1; i < textLines.length; i++) {
    doc.text(textLines[i], bulletX + 6, yPosition);
    yPosition += LINE_HEIGHT;
  }
  
  doc.setTextColor(0, 0, 0);
  yPosition += 1;
};

export const generateAdminManualPdf = (): jsPDF => {
  const doc = new jsPDF('p', 'mm', 'a4');
  currentPage = 1;
  yPosition = MARGIN_TOP;

  // =====================================
  // COVER PAGE
  // =====================================
  yPosition = 60;
  
  // Main title
  doc.setFontSize(36);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text('GetPawsy', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 18;
  
  doc.setFontSize(22);
  doc.setTextColor(50, 50, 50);
  doc.text('Complete Admin Handleiding', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 10;
  doc.text('& Mini-Cursus', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 18;
  
  // Subtitle
  doc.setFontSize(14);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_COLOR);
  doc.text('Rust, overzicht en vertrouwen in je webshop', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  
  // Decorative line
  yPosition += 15;
  doc.setDrawColor(...PRIMARY_COLOR);
  doc.setLineWidth(0.5);
  doc.line(PAGE_WIDTH / 2 - 40, yPosition, PAGE_WIDTH / 2 + 40, yPosition);
  
  yPosition += 25;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  
  const coverIntro = `Welkom bij je persoonlijke handleiding voor GetPawsy. Deze gids is speciaal voor jou geschreven als eigenaar. Het doel is simpel: je rust geven en vertrouwen opbouwen. 

Een webshop runnen kan overweldigend voelen, vooral in het begin. Overal zie je cijfers, grafieken, en meldingen. Het is normaal dat je denkt: "Moet ik hier iets mee? Gaat er iets mis?" 

Het antwoord is meestal: nee. 

Deze handleiding helpt je begrijpen wat je ziet, wanneer je actie moet ondernemen, en vooral: wanneer je gewoon kunt ademhalen. Lees het rustig door, gebruik het als naslagwerk, en onthoud: jouw webshop werkt. Je mag ontspannen.`;

  const lines = doc.splitTextToSize(coverIntro, CONTENT_WIDTH - 20);
  for (const line of lines) {
    doc.text(line, MARGIN_LEFT + 10, yPosition);
    yPosition += LINE_HEIGHT + 0.5;
  }

  addPageNumber(doc);

  // =====================================
  // TABLE OF CONTENTS
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Inhoudsopgave', 24);
  addSpace(doc, 8);

  const tocItems = [
    { title: '1. Introductie', page: 3 },
    { title: '2. Het dashboard bovenin', page: 5 },
    { title: '3. Iconen & symbolen', page: 7 },
    { title: '4. Bezoekersgedrag', page: 11 },
    { title: '5. Producten & categorieën', page: 13 },
    { title: '6. Voorraad & out-of-stock', page: 15 },
    { title: '7. Winkelwagen & afrekenen', page: 17 },
    { title: '8. Orders & betalingen', page: 19 },
    { title: '9. Verzending & retouren', page: 21 },
    { title: '10. Klanten & support', page: 23 },
    { title: '11. Marketing & advertenties', page: 25 },
    { title: '12. Statistieken & analytics', page: 27 },
    { title: '13. Veelgemaakte misverstanden', page: 29 },
    { title: '14. Dagelijkse checklist', page: 31 },
    { title: '15. Afsluiting', page: 33 },
  ];

  doc.setFontSize(12);
  for (const item of tocItems) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(item.title, MARGIN_LEFT + 5, yPosition);
    
    // Dotted line
    const titleWidth = doc.getTextWidth(item.title);
    const dotsStart = MARGIN_LEFT + 5 + titleWidth + 3;
    const dotsEnd = PAGE_WIDTH - MARGIN_RIGHT - 15;
    doc.setTextColor(...MUTED_COLOR);
    for (let x = dotsStart; x < dotsEnd; x += 3) {
      doc.text('.', x, yPosition);
    }
    
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text(item.page.toString(), PAGE_WIDTH - MARGIN_RIGHT, yPosition, { align: 'right' });
    yPosition += 11;
  }

  addPageNumber(doc);

  // =====================================
  // CHAPTER 1 - INTRODUCTIE
  // =====================================
  startNewPage(doc);
  addTitle(doc, '1. Introductie');
  addSpace(doc, 5);

  addSubtitle(doc, 'Wat is het admin-dashboard?');
  addParagraph(doc, `De admin-omgeving van GetPawsy is het controlepaneel van je webshop. Het is de plek waar je alles kunt zien wat er achter de schermen gebeurt: hoeveel bezoekers er zijn, welke producten bekeken worden, of er orders binnenkomen, en hoe je winkel technisch presteert.`);
  
  addParagraph(doc, `Denk aan de admin als het dashboard van een auto. Je ziet snelheid, brandstof, en eventuele waarschuwingslampjes. Maar net zoals je niet in paniek raakt bij elke kleine beweging van de wijzers, hoef je dat ook niet te doen bij elke verandering in je admin.`);

  addInfoBox(doc, 'Goed om te weten', 'De admin is géén indicator van succes of falen op elk willekeurig moment. Het is een hulpmiddel om trends te zien over tijd. Een dag met nul orders betekent niet dat je webshop kapot is.');

  addSubtitle(doc, 'Wat hoef je NIET constant te doen?');
  addBulletPoint(doc, 'Elk uur inloggen om te checken of er iets veranderd is');
  addBulletPoint(doc, 'Elke dag conclusies trekken uit de cijfers');
  addBulletPoint(doc, 'In paniek raken bij lage bezoekersaantallen');
  addBulletPoint(doc, 'Constant sleutelen aan instellingen die al werken');
  addBulletPoint(doc, 'Elke kleine schommeling analyseren');
  
  addSpace(doc, 5);
  
  addSubtitle(doc, 'Waarom "niets doen" vaak correct is');
  addParagraph(doc, `De meeste beginners maken niet de fout dat ze te weinig doen – ze doen te veel. Ze sleutelen, veranderen, optimaliseren, en eindigen met een webshop die in constante flux is, zonder ooit de kans te krijgen om te stabiliseren.`);
  
  addTipBox(doc, 'De gouden regel', 'Bekijk je cijfers maximaal één keer per dag, bij voorkeur \'s avonds. Trek pas conclusies na minimaal een week aan data. Alles daaronder is ruis, geen signaal.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 2 - HET DASHBOARD BOVENIN
  // =====================================
  startNewPage(doc);
  addTitle(doc, '2. Het Dashboard Bovenin');
  addSpace(doc, 5);

  addParagraph(doc, `Wanneer je inlogt in de admin, zie je bovenaan een dashboard met de belangrijkste cijfers. Dit is je snelle overzicht, je "pulse check" van de webshop.`);

  addInfoBox(doc, 'Wat je ziet op het dashboard', 'Bezoekers (vandaag/deze week) • Totale omzet • Aantal orders • Actieve producten • Conversieratio • Gemiddelde orderwaarde');

  addSubtitle(doc, 'Bezoekers');
  addParagraph(doc, `Het aantal bezoekers toont hoeveel unieke mensen je webshop hebben bezocht. Een "bezoeker" is iemand die minimaal één pagina heeft geladen. Dit kan iemand zijn die tien minuten door je producten heeft gekeken, maar ook iemand die per ongeluk op een link klikte en direct weer weg was.`);
  
  addWarningBox(doc, 'Lage bezoekersaantallen zijn normaal voor nieuwe webshops. Je hebt nog geen grote naamsbekendheid. Zie de eerste maanden als een investering in de toekomst.');

  addSubtitle(doc, 'Omzet');
  addParagraph(doc, `Je omzet-getal toont hoeveel euro er is binnengekomen via bestellingen. In het begin zal dit vaak nul zijn. Dat is niet erg. Elke webshop, hoe succesvol ook, begon ooit met nul omzet.`);

  addSubtitle(doc, 'Bestellingen');
  addParagraph(doc, `Het aantal orders is het meest bevredigende cijfer om te zien stijgen. De gemiddelde conversieratio voor e-commerce ligt tussen de 1% en 3%. Dit betekent dat van elke 100 bezoekers, slechts 1 tot 3 mensen iets kopen. Als je vandaag 20 bezoekers had en geen orders, is dat statistisch volkomen normaal.`);

  addSubtitle(doc, 'Producten');
  addParagraph(doc, `Dit cijfer toont hoeveel producten actief en beschikbaar zijn in je catalogus. Bij dropshipping kan dit aantal fluctueren doordat producten bij de leverancier komen en gaan.`);

  addSubtitle(doc, 'Trends vs. momentopnames');
  addTipBox(doc, 'Focus op trends, niet op momentopnames', 'Een trend is een patroon over tijd (weken). Een momentopname is één dag. Kijk altijd naar minimaal 7 dagen data voordat je conclusies trekt. Vergelijk met dezelfde periode vorige maand, niet met gisteren.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 3 - ICONEN & SYMBOLEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, '3. Iconen & Symbolen');
  addSpace(doc, 5);

  addParagraph(doc, `In je admin-omgeving zie je veel iconen en symbolen. Dit hoofdstuk legt elk belangrijk icoon uit in gewone taal, zodat je altijd weet wat je ziet en of je actie moet ondernemen.`);

  addInfoBox(doc, 'Algemene regel', 'Als er geen rode kleur, geen woord "fout" of "error", en geen expliciete oproep tot actie bij staat, dan hoef je waarschijnlijk niets te doen.');

  addSpace(doc, 5);
  
  addIconExplanation(doc, 
    'Doos/Pakket', 
    'Producten',
    'Verwijst naar je productcatalogus met alle items die in je webshop te koop zijn.',
    'Als producten plotseling verdwijnen of foutmeldingen tonen.',
    'Dagelijks controleren is niet nodig. Producten staan er gewoon.'
  );

  addIconExplanation(doc,
    'Winkelwagen',
    'Winkelwagen',
    'Toont activiteit rondom toevoegingen aan de winkelwagen. Een positief signaal van interesse.',
    'Alleen als klanten melden dat ze niets kunnen toevoegen.',
    'Bij lage aantallen terwijl verkeer ook laag is.'
  );

  addIconExplanation(doc,
    'Klok',
    'Tijd / Recente activiteit',
    'Duidt op tijdgebonden informatie: recente activiteit, geplande acties, of verwerkingstijd.',
    'Tenzij er een waarschuwing bij staat.',
    'Dit is puur informatief.'
  );

  startNewPage(doc);

  addIconExplanation(doc,
    'Bel',
    'Meldingen',
    'Toont notificaties over orders, systeemmeldingen, of aandachtspunten.',
    'Alleen meldingen met rode kleur of het woord "fout" of "error".',
    'De meeste meldingen zijn informatief: "Nieuwe order" of "Synchronisatie voltooid".'
  );

  addIconExplanation(doc,
    'Grafiek',
    'Statistieken',
    'Toont trends over tijd. Hier haal je de echte waarde: niet uit individuele getallen, maar uit de richting van de lijn.',
    'Als de lijn consistent daalt over 2+ weken.',
    'Bij dagelijkse schommelingen - dat is normaal.'
  );

  addIconExplanation(doc,
    'Euro',
    'Omzet',
    'Verwijst naar financiële data: omzet, betalingen, of gemiddelde orderwaarde.',
    'Als betalingen niet doorkomen of data niet klopt.',
    'Omzet is een resultaat. Focus op oorzaken (verkeer, conversie).'
  );

  addIconExplanation(doc,
    'Oog',
    'Bezoekers',
    'Representeert bezoekers of pageviews. Toont interesse in je winkel.',
    'Als het getal plotseling naar nul gaat terwijl ads draaien.',
    'Bij normale fluctuaties - kwaliteit is belangrijker dan kwantiteit.'
  );

  startNewPage(doc);

  addIconExplanation(doc,
    'Wereldbol',
    'Locaties',
    'Toont geografische data: waar komen je bezoekers vandaan?',
    'Als je verkeer uit onverwachte landen komt (kan spam zijn).',
    'Dit is interessant voor analyse, maar vraagt zelden actie.'
  );

  addIconExplanation(doc,
    'Driehoek',
    'Waarschuwing',
    'Een gele of oranje driehoek is een waarschuwing, geen error.',
    'Bij waarschuwingen over betaalfouten of kritieke processen.',
    'Bij "lage voorraad" of "lange laadtijd" - niet altijd urgent.'
  );

  addIconExplanation(doc,
    'Vinkje',
    'Succes',
    'Betekent: alles in orde. Bij succesvolle acties of voltooide synchronisaties.',
    'Nooit - dit is bevestiging dat het systeem werkt.',
    'Altijd. Een groen vinkje is goed nieuws.'
  );

  addIconExplanation(doc,
    'Pijlen',
    'Synchronisatie',
    'Duidt op synchronisatie of verversing. Data wordt bijgewerkt.',
    'Als het langer dan 5 minuten duurt, ververs de pagina.',
    'Wacht rustig tot het klaar is. Meestal lost het zichzelf op.'
  );

  startNewPage(doc);

  addIconExplanation(doc,
    'Trechter',
    'Funnel',
    'Toont je conversie-funnel: van homepage naar product naar winkelwagen naar checkout.',
    'Als er 0% conversie is bij een specifieke stap na veel verkeer.',
    'Het is normaal dat 50-80% afhaakt bij elke stap.'
  );

  addIconExplanation(doc,
    'Vuur',
    'Heatmap',
    'Toont waar bezoekers klikken of scrollen. Rood = populair, blauw = genegeerd.',
    'Eens per maand bekijken als je wilt optimaliseren.',
    'Dit is geen dagelijkse check - puur voor analyse.'
  );

  addIconExplanation(doc,
    'Lijn',
    'Analytics',
    'Leidt naar gedetailleerde statistieken voor diepere analyse.',
    'Wanneer je specifieke vragen hebt over prestaties.',
    'Te veel analyseren leidt tot over-denken. Vertrouw je dashboard.'
  );

  addIconExplanation(doc,
    'Megafoon',
    'Advertenties',
    'Verwijst naar je advertentie-instellingen of -resultaten.',
    'Als ads 7+ dagen draaien zonder enige klikken.',
    'In de eerste 3-7 dagen - ads hebben een leerfase.'
  );

  addIconExplanation(doc,
    'Tandwiel',
    'Instellingen',
    'Leidt naar configuratie-opties voor je webshop.',
    'Alleen als je specifiek iets wilt aanpassen.',
    'Als iets werkt, hoef je het niet aan te passen.'
  );

  addPageNumber(doc);

  // =====================================
  // CHAPTER 4 - BEZOEKERSGEDRAG
  // =====================================
  startNewPage(doc);
  addTitle(doc, '4. Bezoekersgedrag');
  addSpace(doc, 5);

  addSubtitle(doc, 'Waarom mensen vaak alleen kijken');
  addParagraph(doc, `Laten we beginnen met een belangrijke waarheid: de overgrote meerderheid van je bezoekers zal niet kopen. Dit is geen falen van jouw webshop; dit is hoe online winkelen werkt.`);
  
  addInfoBox(doc, 'De cijfers', 'Slechts 1-3% van e-commerce bezoekers doet daadwerkelijk een aankoop. Van elke 100 mensen die je site bezoeken, vertrekken 97 tot 99 zonder iets te kopen. Dit is wereldwijd standaard.');

  addParagraph(doc, `Online kost het één klik om ergens te landen en één klik om weer te vertrekken. Mensen browsen, vergelijken, bookmarken voor later, laten zich afleiden, of realiseren zich simpelweg dat ze het product nu niet nodig hebben.`);

  addSubtitle(doc, 'Waarom dit normaal is');
  addParagraph(doc, `Een gemiddelde consument bezoekt een webshop meerdere keren voordat ze kopen. Dit heet de "customer journey" en kan dagen of zelfs weken duren:`);
  
  addBulletPoint(doc, 'Dag 1: Ziet advertentie, bezoekt site, kijkt rond, vertrekt');
  addBulletPoint(doc, 'Dag 3: Denkt eraan terug, googelt je productnaam');
  addBulletPoint(doc, 'Dag 7: Komt terug na salaris, koopt eindelijk');
  
  addSpace(doc, 5);
  
  addTipBox(doc, 'Terugkerende bezoekers', 'Als je in je analytics ziet dat mensen terugkeren naar je site, is dat een uitstekend teken. Terugkerende bezoekers hebben een veel hogere kans om te converteren dan nieuwe bezoekers.');

  addSubtitle(doc, 'Wat cijfers echt betekenen');
  addParagraph(doc, `Bezoekersaantallen zijn geen directe indicator van succes. Honderd gerichte bezoekers via een goede advertentie zijn meer waard dan duizend willekeurige bezoekers. Focus op kwaliteit boven kwantiteit.`);

  addSubtitle(doc, 'Waarom twijfel geen fout is');
  addParagraph(doc, `Het is volkomen normaal om te twijfelen of je webshop "werkt" als je lage cijfers ziet. Maar onthoud: elke grote webshop begon precies waar jij nu bent. Het verschil is dat zij bleven volhouden.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 5 - PRODUCTEN & CATEGORIEËN
  // =====================================
  startNewPage(doc);
  addTitle(doc, '5. Producten & Categorieën');
  addSpace(doc, 5);

  addSubtitle(doc, 'Lege categorieën zijn GEEN fout');
  addParagraph(doc, `Het is volkomen normaal en correct dat een hoofdcategorie zelf geen producten bevat, maar alleen subcategorieën. Bijvoorbeeld: de categorie "Hondenvoeding" kan leeg zijn, terwijl de subcategorieën "Droogvoer", "Natvoer" en "Snacks" wél producten bevatten.`);

  addInfoBox(doc, 'Waarom je "0 producten" ziet', 'Dit is geen fout - dit is goede organisatie. De producten zitten een niveau dieper, in de subcategorieën. Je hoeft hier niets aan te veranderen.');

  addSubtitle(doc, 'Subcategorie-logica');
  addParagraph(doc, `Er zijn meerdere geldige redenen waarom een categorie nul producten kan tonen:`);
  addBulletPoint(doc, 'De producten zitten in subcategorieën (correct!)');
  addBulletPoint(doc, 'De categorie is nieuw en wordt nog gevuld');
  addBulletPoint(doc, 'Het is een seizoensgebonden categorie die tijdelijk leeg is');
  addBulletPoint(doc, 'Het is een placeholder voor toekomstige uitbreiding');

  addSubtitle(doc, 'Wanneer producten verdwijnen (en wanneer niet)');
  addParagraph(doc, `Bij dropshipping heb je een leverancier die de producten beheert. Dit betekent dat producten soms automatisch worden bijgewerkt: nieuwe producten verschijnen, prijzen veranderen, of items worden uitgeschakeld als de leverancier ze niet meer heeft.`);
  
  addWarningBox(doc, 'Een product is pas een probleem als: klanten klagen dat ze iets niet kunnen vinden, producten niet laden op je website, of je ziet foutmeldingen bij het openen. Dit is zeldzaam.');

  addTipBox(doc, 'Wat je wél moet doen', 'Controleer periodiek (wekelijks) of je bestsellers nog beschikbaar zijn. Maak je geen zorgen over kleine fluctuaties in je totale productaantal.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 6 - VOORRAAD & OUT-OF-STOCK
  // =====================================
  startNewPage(doc);
  addTitle(doc, '6. Voorraad & Out-of-Stock');
  addSpace(doc, 5);

  addSubtitle(doc, 'Dropshipping-logica');
  addParagraph(doc, `Bij een traditionele webshop heb je producten liggen in een magazijn. Bij dropshipping is dit anders. Je "voorraad" is eigenlijk de voorraad van je leverancier. Jij houdt geen fysieke producten aan – je stuurt bestellingen door naar de leverancier die direct naar de klant verstuurt.`);

  addInfoBox(doc, 'Wat voorraad betekent bij dropshipping', 'Een voorraadcijfer toont de beschikbaarheid bij je leverancier, niet een fysieke voorraad bij jou. Stock = beschikbaar bij leverancier.');

  addSubtitle(doc, 'Waarom "stock = 0" niet per se uitverkocht betekent');
  addParagraph(doc, `Er zijn technische redenen waarom een product nul voorraad kan tonen terwijl het wel beschikbaar is:`);
  addBulletPoint(doc, 'Sommige leveranciers werken met "infinite stock"');
  addBulletPoint(doc, 'Synchronisatie loopt nog');
  addBulletPoint(doc, 'Leverancier updatet alleen op bepaalde momenten');

  addTipBox(doc, 'De echte vraag', 'Kunnen klanten het product kopen op je website? Als de "In winkelwagen" knop werkt en er geen "Uitverkocht" melding staat, dan is het product beschikbaar.');

  addSubtitle(doc, 'Wanneer je moet ingrijpen');
  addParagraph(doc, `Een product is echt niet beschikbaar wanneer:`);
  addBulletPoint(doc, 'Het expliciet op "Uitverkocht" staat op de website');
  addBulletPoint(doc, 'De "Koop" knop niet werkt');
  addBulletPoint(doc, 'Het product niet meer zichtbaar is in de catalogus');

  addSubtitle(doc, 'Wanneer NIET ingrijpen');
  addParagraph(doc, `Maak je niet gek met dagelijks voorraad checken. De meeste dropshipping-systemen werken automatisch. Producten die niet meer leverbaar zijn, worden vanzelf gemarkeerd of uitgeschakeld.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 7 - WINKELWAGEN & AFREKENEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, '7. Winkelwagen & Afrekenen');
  addSpace(doc, 5);

  addSubtitle(doc, 'Hoe je weet dat checkout werkt');
  addParagraph(doc, `De beste manier om te weten dat je checkout werkt, is door het zelf te testen. Ga periodiek (bijvoorbeeld maandelijks) door het hele proces: selecteer een product, voeg toe aan winkelwagen, ga naar checkout, en controleer of alle stappen werken tot aan de betalingspagina.`);

  addTipBox(doc, 'Test je eigen checkout', 'Je hoeft niet daadwerkelijk te betalen. Controleer alleen of elke stap werkt en of er geen foutmeldingen verschijnen.');

  addSubtitle(doc, 'Waarom "geen orders" in begin normaal is');
  addParagraph(doc, `Als je net begint, zal je order-overzicht leeg zijn. Dit is volkomen normaal. Elke succesvolle webshop begon met een lege orderpagina. De eerste order is een mijlpaal die je moet vieren, niet iets dat je vanaf dag één moet verwachten.`);

  addInfoBox(doc, 'Geen orders betekent niet', 'Dat je checkout kapot is • Dat niemand je producten wil • Dat je moet stoppen met adverteren. Het betekent simpelweg dat je nog geen kopers hebt gehad - en dat kost tijd.');

  addSubtitle(doc, 'Verschil tussen test en echte klanten');
  addParagraph(doc, `Wanneer je zelf test, gebruik je misschien dezelfde browser, hetzelfde apparaat, en dezelfde route elke keer. Echte klanten komen via verschillende apparaten, browsers, en paden. Een test die werkt betekent niet dat alles 100% werkt voor iedereen - maar het is een goede indicatie.`);

  addWarningBox(doc, 'Als meerdere echte klanten melden dat ze niet kunnen afrekenen, is dat een serieus signaal. Eén klant met problemen kan toeval zijn; meerdere klanten is een patroon dat aandacht verdient.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 8 - ORDERS & BETALINGEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, '8. Orders & Betalingen');
  addSpace(doc, 5);

  addSubtitle(doc, 'Orderstatussen uitgelegd');
  addParagraph(doc, `Wanneer een order binnenkomt, doorloopt deze verschillende statussen:`);
  
  addBulletPoint(doc, 'Nieuw/Ontvangen: De bestelling is geplaatst');
  addBulletPoint(doc, 'Betaald: De klant heeft succesvol betaald');
  addBulletPoint(doc, 'In verwerking: Order wordt klaargezet bij leverancier');
  addBulletPoint(doc, 'Verzonden: Pakket is onderweg naar de klant');
  addBulletPoint(doc, 'Afgeleverd: Klant heeft pakket ontvangen');
  
  addSpace(doc, 5);

  addSubtitle(doc, 'Betaald is NIET hetzelfde als verzonden');
  addInfoBox(doc, 'Belangrijk onderscheid', '"Betaald" betekent dat het geld binnen is. "Verzonden" betekent dat het pakket onderweg is. Er zit tijd tussen deze stappen - bij dropshipping typisch 1-3 werkdagen voor verwerking.');

  addSubtitle(doc, 'Wat automatisch loopt');
  addParagraph(doc, `Bij dropshipping wordt het meeste automatisch afgehandeld:`);
  addBulletPoint(doc, 'Betaling wordt verwerkt via je betaalprovider');
  addBulletPoint(doc, 'Order wordt doorgestuurd naar je leverancier');
  addBulletPoint(doc, 'Leverancier verzendt direct naar de klant');
  addBulletPoint(doc, 'Tracking wordt automatisch bijgewerkt');

  addTipBox(doc, 'Je hoeft bij de meeste orders niets te doen', 'Het systeem werkt automatisch. Grijp alleen in bij expliciete problemen: annuleringsverzoeken, mislukte betalingen, of leveringsproblemen.');

  addSubtitle(doc, 'Wanneer actie nodig is');
  addBulletPoint(doc, 'Een klant vraagt om annulering - verwerk dit snel');
  addBulletPoint(doc, 'Een betaling is mislukt maar de order is aangemaakt - contacteer de klant');
  addBulletPoint(doc, 'De leverancier meldt een probleem - communiceer proactief met je klant');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 9 - VERZENDING & RETOUREN
  // =====================================
  startNewPage(doc);
  addTitle(doc, '9. Verzending & Retouren');
  addSpace(doc, 5);

  addSubtitle(doc, 'Verwachte levertijden');
  addParagraph(doc, `Levertijden variëren afhankelijk van waar je leverancier is gevestigd, welke bezorgdienst wordt gebruikt, en waar je klant woont. Voor standaard verzending kun je typisch rekenen op:`);
  
  addBulletPoint(doc, 'Verwerking: 1-3 werkdagen');
  addBulletPoint(doc, 'Verzending binnen Europa: 5-10 werkdagen');
  addBulletPoint(doc, 'Verzending buiten Europa: 10-20 werkdagen');

  addInfoBox(doc, 'Verwachtingsmanagement is alles', 'Als je website "5-10 werkdagen" vermeldt en de klant ontvangt binnen 7 dagen, is iedereen tevreden. Als je "2 dagen" belooft en het duurt een week, krijg je klachten.');

  addSubtitle(doc, 'Tracking');
  addParagraph(doc, `Klanten willen weten waar hun pakket is. Een tracking-code stelt hen gerust. Bij dropshipping ontvang je de tracking-code van je leverancier, die automatisch naar de klant wordt doorgestuurd.`);

  addWarningBox(doc, 'Soms duurt het 1-2 werkdagen voordat tracking-informatie beschikbaar is. Leg dit uit in je verzendmail om onnodige vragen te voorkomen.');

  addSubtitle(doc, 'Wanneer klanten contact opnemen');
  addParagraph(doc, `De meeste klantvragen over verzending komen door onduidelijke verwachtingen. Veelvoorkomende vragen:`);
  addBulletPoint(doc, '"Waar is mijn pakket?" - Verwijs naar de tracking-link');
  addBulletPoint(doc, '"Het duurt zo lang" - Leg de normale levertijd uit');
  addBulletPoint(doc, '"Tracking werkt niet" - Check of het pakket al verzonden is');

  addTipBox(doc, 'Proactieve communicatie', 'Stuur automatisch een bevestigingsmail bij bestelling en een update bij verzending met tracking. Dit voorkomt 80% van de klantvragen.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 10 - KLANTEN & SUPPORT
  // =====================================
  startNewPage(doc);
  addTitle(doc, '10. Klanten & Support');
  addSpace(doc, 5);

  addSubtitle(doc, 'Wanneer reageren');
  addParagraph(doc, `Reageer snel (binnen 24 uur) op:`);
  addBulletPoint(doc, 'Vragen over bestellingen en leveringen');
  addBulletPoint(doc, 'Klachten over producten of service');
  addBulletPoint(doc, 'Verzoeken om annulering of retour');
  addBulletPoint(doc, 'Technische problemen met bestellen');

  addSubtitle(doc, 'Wanneer wachten');
  addParagraph(doc, `Niet elke vraag vereist direct actie. Je mag wachten bij:`);
  addBulletPoint(doc, 'Algemene productinformatie (antwoord binnen 24-48 uur)');
  addBulletPoint(doc, '"Wanneer is mijn pakket er?" terwijl het nog binnen normale levertijd valt');
  addBulletPoint(doc, 'Suggesties of feedback (bedank en noteer voor later)');

  addInfoBox(doc, 'Vuistregel', 'Urgente zaken (klachten, problemen): binnen 24 uur. Niet-urgente zaken: binnen 48 uur. Een snelle, vriendelijke reactie bouwt meer vertrouwen dan een perfecte reactie die dagen duurt.');

  addSubtitle(doc, 'Hoe rust vertrouwen uitstraalt');
  addParagraph(doc, `Klanten voelen het als je gestrest bent in je communicatie. Een rustige, vriendelijke toon - ook bij problemen - straalt professionaliteit uit. Zelfs als iets mis gaat, kan een goed afgehandelde klacht een klant loyaler maken.`);

  addTipBox(doc, 'De kracht van eerlijkheid', 'Als er iets mis gaat, wees eerlijk. Klanten waarderen transparantie. "Er is een vertraging, we houden je op de hoogte" is beter dan stilte of vage excuses.');

  addSubtitle(doc, 'Veelgestelde vragen voorbereiden');
  addParagraph(doc, `Maak een lijst van veelgestelde vragen en standaard antwoorden. Dit bespaart tijd en zorgt voor consistente communicatie. Denk aan: levertijden, retourbeleid, productinformatie, en betaalmethoden.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 11 - MARKETING & ADVERTENTIES
  // =====================================
  startNewPage(doc);
  addTitle(doc, '11. Marketing & Advertenties');
  addSpace(doc, 5);

  addSubtitle(doc, 'Wat advertenties eerst doen: leren');
  addParagraph(doc, `Online advertenties zijn geen lichtschakelaar. Je zet ze niet aan en krijgt direct verkopen. Advertentieplatforms zoals Facebook, Instagram, Pinterest en Google hebben een "leerfase" nodig.`);

  addInfoBox(doc, 'De leerfase', 'Tijdens deze fase (3-7 dagen) verzamelt het algoritme data over wie er op je ads klikt, wie doorgaat naar je site, en wie koopt. Je zult kosten zien zonder proportionele resultaten. Dat is normaal.');

  addSubtitle(doc, 'Waarom dag 1 niets zegt');
  addParagraph(doc, `De resultaten van dag 1 zijn statistisch onbetrouwbaar. Je ziet misschien veel vertoningen, weinig klikken, en geen verkopen. Of juist omgekeerd. Dit is ruis, geen signaal.`);

  addWarningBox(doc, 'De grootste fout die nieuwe adverteerders maken is te snel conclusies trekken. Na één dag met hoge kosten en geen verkopen, paniekeren ze en stoppen de campagne. Dit is contraproductief.');

  addSubtitle(doc, 'Minimale looptijd: 7-14 dagen');
  addParagraph(doc, `Geef campagnes minimaal 7 dagen voordat je beoordeelt. Liever 14 dagen. In die tijd verzamelt het platform genoeg data om te optimaliseren. De kosten per resultaat dalen vaak significant na de leerfase.`);

  addSubtitle(doc, 'Verschil verkeer vs conversie');
  addBulletPoint(doc, 'Verkeer: Mensen naar je site krijgen (clicks)');
  addBulletPoint(doc, 'Conversie: Mensen die daadwerkelijk kopen');
  
  addSpace(doc, 3);
  
  addParagraph(doc, `Je kunt veel verkeer hebben zonder conversies. Dat kan liggen aan: verkeerde doelgroep, niet-overtuigende productpagina\'s, of simpelweg dat mensen nog in de oriëntatiefase zitten. Analyseer pas na voldoende data.`);

  addTipBox(doc, 'Marketing is een marathon', 'Succesvolle webshops bouwen maanden aan hun advertentiestrategieën. Verwacht geen instant succes; werk naar duurzame groei. Denk in kwartalen, niet in dagen.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 12 - STATISTIEKEN & ANALYTICS
  // =====================================
  startNewPage(doc);
  addTitle(doc, '12. Statistieken & Analytics');
  addSpace(doc, 5);

  addSubtitle(doc, 'AOV (Average Order Value)');
  addParagraph(doc, `AOV (gemiddelde orderwaarde) vertelt je hoeveel een klant gemiddeld per bestelling uitgeeft. Bereken: totale omzet / aantal orders. Bijvoorbeeld: €1000 omzet met 20 orders = €50 AOV.`);
  
  addTipBox(doc, 'AOV verhogen', 'Duurdere producten toevoegen • Bundels aanbieden • Drempels voor gratis verzending • Upsells bij checkout');

  addSubtitle(doc, 'Conversieratio');
  addParagraph(doc, `Conversieratio is het percentage bezoekers dat koopt. Als 100 mensen je site bezoeken en 2 kopen, is je conversie 2%.`);
  
  addInfoBox(doc, 'Benchmarks', '1-3% conversie is gemiddeld voor e-commerce. 3-5% is goed. Boven 5% is excellent. Met 50 bezoekers kun je geen conclusies trekken - je hebt honderden bezoekers nodig voor betrouwbare data.');

  addSubtitle(doc, 'Add-to-Cart Rate');
  addParagraph(doc, `Dit toont hoeveel procent van bezoekers iets aan de winkelwagen toevoegt. Gemiddeld 5-15% voor e-commerce.`);
  
  addBulletPoint(doc, 'Goede add-to-cart maar lage conversie? Probleem ligt na de winkelwagen (checkout, verzendkosten)');
  addBulletPoint(doc, 'Lage add-to-cart? Probleem ligt eerder (productpresentatie, prijs, aanbod)');

  addSubtitle(doc, 'Waarom trends belangrijker zijn dan pieken');
  addParagraph(doc, `Een piek is een uitzondering - een dag met ongewoon hoge of lage cijfers. Een trend is een patroon over tijd. Pieken zijn interessant maar niet actionable. Trends zijn waar je je strategie op baseert.`);

  addWarningBox(doc, 'Bekijk altijd grafieken over minimaal 7 dagen, liever 30. Vergelijk met dezelfde periode vorige maand. Zoek naar consistente bewegingen, niet naar individuele uitschieters.');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 13 - VEELGEMAAKTE MISVERSTANDEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, '13. Veelgemaakte Misverstanden');
  addSpace(doc, 5);

  addSubtitle(doc, '"0 bezoekers = er is iets fout"');
  addParagraph(doc, `NIET WAAR. Nul bezoekers op een bepaald moment - vooral \'s nachts of vroeg in de ochtend - is volkomen normaal. Mensen winkelen niet 24/7. Check je dagelijkse of wekelijkse totalen, niet elk uur.`);
  
  addInfoBox(doc, 'De realiteit', 'Nieuwe webshops zonder actieve marketing hebben weinig organisch verkeer. Dit is geen fout, dit is het startpunt. Verkeer groeit met tijd, SEO, en advertenties.');

  addSubtitle(doc, '"Lege categorie = kapot"');
  addParagraph(doc, `NIET WAAR. Een lege hoofdcategorie met gevulde subcategorieën is correct. Een tijdelijk lege categorie door seizoen of leverancier is normaal. Alleen een categorie die producten zou moeten bevatten én zichtbaar is voor klanten én leeg is, verdient aandacht.`);

  addSubtitle(doc, '"Ik moet elke dag aanpassen"');
  addParagraph(doc, `NIET WAAR. Dagelijks aanpassen is contraproductief. Elke verandering verstoort je data. Je kunt niet meten wat werkt als je constant alles verandert. Grote bedrijven testen één verandering per keer en wachten weken op resultaten.`);

  addTipBox(doc, 'De waarheid', 'Je webshop is ontworpen om te werken zonder dagelijkse interventie. Als alles functioneert, is het beste wat je kunt doen: niets doen en data laten accumuleren.');

  addSubtitle(doc, 'Andere misverstanden');
  addBulletPoint(doc, '"Meer producten = meer verkopen" - Kwaliteit boven kwantiteit');
  addBulletPoint(doc, '"Advertenties werken niet na 1 dag" - Ze hebben 7-14 dagen nodig');
  addBulletPoint(doc, '"Mijn concurrenten doen het beter" - Je ziet alleen hun succes, niet hun worstelingen');
  addBulletPoint(doc, '"Ik moet altijd beschikbaar zijn" - Goede systemen draaien zonder jou');

  addPageNumber(doc);

  // =====================================
  // CHAPTER 14 - DAGELIJKSE CHECKLIST
  // =====================================
  startNewPage(doc);
  addTitle(doc, '14. Dagelijkse Checklist');
  addSpace(doc, 5);

  addSubtitle(doc, 'Dagelijkse check (5 minuten)');
  addParagraph(doc, `Je doel is niet om alles te analyseren, maar om te verifiëren dat er geen brandjes zijn. Dit kun je \'s ochtends of \'s avonds doen.`);
  
  addSpace(doc, 3);
  addChecklistItem(doc, 'Open je admin en bekijk het dashboard bovenin', true);
  addChecklistItem(doc, 'Check op rode waarschuwingen of foutmeldingen', true);
  addChecklistItem(doc, 'Bekijk kort meldingen/notificaties', true);
  addChecklistItem(doc, 'Check je e-mail voor klantberichten', true);
  addChecklistItem(doc, 'Als alles groen is: door met je dag', true);
  
  addSpace(doc, 5);
  
  addChecklistItem(doc, 'Elk uur inloggen om te checken', false);
  addChecklistItem(doc, 'Conclusies trekken uit dagelijkse data', false);
  addChecklistItem(doc, 'Instellingen aanpassen die al werken', false);
  addChecklistItem(doc, 'In paniek raken bij lage cijfers', false);

  addSubtitle(doc, 'Wekelijkse check (30 minuten)');
  addParagraph(doc, `De wekelijkse check is grondiger. Dit is waar je trends bekijkt.`);
  
  addSpace(doc, 3);
  addChecklistItem(doc, 'Bekijk analytics over de afgelopen 7 dagen', true);
  addChecklistItem(doc, 'Vergelijk met de week ervoor', true);
  addChecklistItem(doc, 'Controleer of bestsellers nog beschikbaar zijn', true);
  addChecklistItem(doc, 'Bekijk advertentieprestaties (als je ads draait)', true);
  addChecklistItem(doc, 'Controleer verzendstatussen van openstaande orders', true);
  addChecklistItem(doc, 'Lees eventuele reviews of feedback', true);
  addChecklistItem(doc, 'Maak 1 notitie: wat was goed, wat kan beter?', true);
  
  addSpace(doc, 5);
  
  addChecklistItem(doc, 'Elk product individueel controleren', false);
  addChecklistItem(doc, 'Elke pagina testen', false);
  addChecklistItem(doc, 'Elk analytics-rapport uitpluizen', false);
  addChecklistItem(doc, 'Optimaliseren wat al werkt', false);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 15 - AFSLUITING
  // =====================================
  startNewPage(doc);
  addTitle(doc, '15. Afsluiting');
  addSpace(doc, 5);

  addSubtitle(doc, 'Je hebt dit');
  addParagraph(doc, `Als je deze handleiding helemaal hebt gelezen, heb je nu een solide basis om je webshop met vertrouwen te runnen. Je weet wat de cijfers betekenen en – nog belangrijker – wat ze niet betekenen. Je weet wanneer je moet ingrijpen en wanneer je moet wachten.`);

  addInfoBox(doc, 'Wat je nu weet', 'Niets doen is soms de beste strategie • Trends zijn belangrijker dan momentopnames • Lage cijfers in het begin zijn normaal • Je systemen werken ook als jij even pauzeert');

  addSubtitle(doc, 'Vertrouwen opbouwen');
  addParagraph(doc, `Vertrouwen in je webshop groeit met ervaring. De eerste keer dat je een dag zonder orders ziet, is dat eng. De tiende keer weet je: dat is normaal, morgen is er weer een dag. Elk obstakel dat je overwint, bouwt vertrouwen.`);

  addSubtitle(doc, 'Je webshop werkt ook als jij even niets doet');
  addParagraph(doc, `Dit is het belangrijkste bericht van deze hele handleiding: je webshop werkt. De techniek is goed. De processen zijn opgezet. Klanten kunnen vinden, browsen, kopen, en ontvangen. Alles is er.`);

  addTipBox(doc, 'Je mag ademhalen', 'Je mag je ontspannen. Je mag je laptop dichtklappen en iets anders doen. Je webshop draait op de achtergrond, 24/7, zonder dat jij constant hoeft te kijken.');

  addParagraph(doc, `Stilte is geen probleem. Lage cijfers zijn geen crisis. Een dag zonder orders is geen ramp. Dit zijn normale onderdelen van het runnen van een online business. Behandel ze als zodanig.`);

  addParagraph(doc, `Je hebt gekozen voor ondernemerschap, en dat vraagt moed. Maar ondernemerschap betekent niet constant in spanning leven. Het betekent slimme systemen bouwen en ze laten werken. Dat heb je gedaan. Nu mag je ervan genieten.`);

  addSpace(doc, 15);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED_COLOR);
  doc.text('Met vertrouwen en rust,', MARGIN_LEFT, yPosition);
  yPosition += 8;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY_COLOR);
  doc.text('Het GetPawsy Team', MARGIN_LEFT, yPosition);

  addPageNumber(doc);

  return doc;
};

export const downloadAdminManualPdf = (): void => {
  const doc = generateAdminManualPdf();
  doc.save('GetPawsy_Complete_Admin_Handleiding.pdf');
};
