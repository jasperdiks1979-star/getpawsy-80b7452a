import jsPDF from 'jspdf';

/**
 * GetPawsy Complete Admin Handleiding PDF Generator
 * Nederlandse handleiding voor de webshop eigenaar
 */

const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 25;
const MARGIN_BOTTOM = 25;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const LINE_HEIGHT = 7;

let currentPage = 1;
let yPosition = MARGIN_TOP;

const addPageNumber = (doc: jsPDF) => {
  doc.setFontSize(10);
  doc.setTextColor(128, 128, 128);
  doc.text(`Pagina ${currentPage}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 10, { align: 'center' });
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

const addTitle = (doc: jsPDF, text: string, fontSize: number = 24) => {
  checkPageBreak(doc, 40);
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'bold');
  doc.text(text, MARGIN_LEFT, yPosition);
  yPosition += fontSize * 0.5 + 5;
};

const addSubtitle = (doc: jsPDF, text: string, fontSize: number = 14) => {
  checkPageBreak(doc, 25);
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'bold');
  doc.text(text, MARGIN_LEFT, yPosition);
  yPosition += fontSize * 0.4 + 3;
};

const addParagraph = (doc: jsPDF, text: string, fontSize: number = 11) => {
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'normal');
  
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  
  for (const line of lines) {
    checkPageBreak(doc, LINE_HEIGHT + 5);
    doc.text(line, MARGIN_LEFT, yPosition);
    yPosition += LINE_HEIGHT;
  }
  yPosition += 4;
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

export const generateAdminManualPdf = (): jsPDF => {
  const doc = new jsPDF('p', 'mm', 'a4');
  currentPage = 1;
  yPosition = MARGIN_TOP;

  // =====================================
  // COVER PAGE
  // =====================================
  yPosition = 80;
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('GetPawsy', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 15;
  
  doc.setFontSize(20);
  doc.text('Complete Admin Handleiding', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 10;
  doc.text('& Mini-Cursus', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  yPosition += 20;
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'italic');
  doc.text('Rust, overzicht en vertrouwen in je webshop.', PAGE_WIDTH / 2, yPosition, { align: 'center' });
  
  yPosition += 40;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  
  const coverIntro1 = `Deze handleiding is speciaal voor jou geschreven als eigenaar van GetPawsy. Het doel is simpel: je rust geven. Een webshop runnen kan overweldigend voelen, vooral als je voor het eerst met een admin-omgeving werkt. Overal zie je cijfers, grafieken, kleuren en meldingen. Het is normaal dat je in het begin denkt: "Moet ik hier iets mee? Gaat er iets mis?" Het antwoord is meestal: nee. Deze handleiding helpt je begrijpen wat je ziet, wanneer je actie moet ondernemen, en vooral: wanneer je gewoon kunt ademhalen.`;
  
  const coverIntro2 = `Stilte in je admin is normaal. Lage cijfers zijn normaal. Dagen zonder orders zijn normaal, zeker in het begin. Je webshop is geen winkel in een drukke winkelstraat waar constant mensen binnenlopen. Het is een digitale etalage die tijd nodig heeft om gevonden te worden, vertrouwen op te bouwen en klanten te overtuigen. Deze handleiding leert je om de ruis te negeren en te focussen op wat écht belangrijk is. Lees het rustig door, gebruik het als naslagwerk, en onthoud: jouw webshop werkt. Je mag ontspannen.`;

  const lines1 = doc.splitTextToSize(coverIntro1, CONTENT_WIDTH);
  for (const line of lines1) {
    doc.text(line, MARGIN_LEFT, yPosition);
    yPosition += LINE_HEIGHT;
  }
  yPosition += 8;
  
  const lines2 = doc.splitTextToSize(coverIntro2, CONTENT_WIDTH);
  for (const line of lines2) {
    doc.text(line, MARGIN_LEFT, yPosition);
    yPosition += LINE_HEIGHT;
  }

  addPageNumber(doc);

  // =====================================
  // TABLE OF CONTENTS
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Inhoudsopgave', 22);
  addSpace(doc, 10);

  const tocItems = [
    { title: 'Hoofdstuk 1 – Introductie', page: 3 },
    { title: 'Hoofdstuk 2 – Het dashboard bovenin', page: 5 },
    { title: 'Hoofdstuk 3 – Iconen & symbolen', page: 7 },
    { title: 'Hoofdstuk 4 – Bezoekersgedrag', page: 11 },
    { title: 'Hoofdstuk 5 – Producten & categorieën', page: 13 },
    { title: 'Hoofdstuk 6 – Voorraad & Out of Stock', page: 15 },
    { title: 'Hoofdstuk 7 – Winkelwagen & afrekenen', page: 17 },
    { title: 'Hoofdstuk 8 – Orders & betalingen', page: 19 },
    { title: 'Hoofdstuk 9 – Verzending & statussen', page: 21 },
    { title: 'Hoofdstuk 10 – Marketing & advertenties', page: 23 },
    { title: 'Hoofdstuk 11 – Analytics & cijfers lezen', page: 25 },
    { title: 'Hoofdstuk 12 – Wanneer ingrijpen', page: 27 },
    { title: 'Hoofdstuk 13 – Wanneer niets doen', page: 29 },
    { title: 'Hoofdstuk 14 – Dagelijkse & wekelijkse checklist', page: 31 },
    { title: 'Hoofdstuk 15 – Afsluiting', page: 33 },
  ];

  doc.setFontSize(12);
  for (const item of tocItems) {
    doc.setFont('helvetica', 'normal');
    doc.text(item.title, MARGIN_LEFT, yPosition);
    doc.text(item.page.toString(), PAGE_WIDTH - MARGIN_RIGHT, yPosition, { align: 'right' });
    yPosition += 10;
  }

  addPageNumber(doc);

  // =====================================
  // CHAPTER 1 - INTRODUCTIE
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 1 – Introductie', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'Wat is de admin-omgeving?');
  addParagraph(doc, `De admin-omgeving van GetPawsy is het controlepaneel van je webshop. Het is de plek waar je alles kunt zien wat er achter de schermen gebeurt: hoeveel bezoekers er zijn, welke producten bekeken worden, of er orders binnenkomen, en hoe je winkel technisch presteert. Denk aan de admin als het dashboard van een auto. Je ziet snelheid, brandstof, en eventuele waarschuwingslampjes. Maar net zoals je niet in paniek raakt bij elke kleine beweging van de wijzers, hoef je dat ook niet te doen bij elke verandering in je admin.`);

  addParagraph(doc, `De admin is géén indicator van succes of falen op elk willekeurig moment. Het is een hulpmiddel om trends te zien over tijd. Een dag met nul orders betekent niet dat je webshop kapot is. Een week met weinig bezoekers betekent niet dat niemand je producten wil. Het betekent simpelweg dat je webshop nog groeit, dat je doelgroep je nog aan het ontdekken is, en dat dit proces tijd kost. Dat is volkomen normaal.`);

  addSubtitle(doc, 'Wat de admin NIET is');
  addParagraph(doc, `De admin is geen paniekmachine. Het is geen systeem dat je constant moet controleren. Je hoeft niet elk uur in te loggen om te kijken of er iets veranderd is. Veel beginnende webshop-eigenaren maken de fout om te vaak te kijken, te veel te analyseren, en te snel conclusies te trekken. Dit leidt tot onnodige stress en vaak tot verkeerde beslissingen.`);

  addParagraph(doc, `Stel je voor: je kijkt om 9 uur 's ochtends en ziet nul bezoekers. Om 10 uur kijk je weer: nog steeds weinig. Je raakt gestrest. Maar de realiteit is dat de meeste mensen overdag werken en 's avonds shoppen. Als je om 21 uur kijkt, zie je misschien tientallen bezoekers. Het punt is: momentopnames zijn misleidend. Focus op dagelijkse en wekelijkse trends, niet op elk afzonderlijk cijfer.`);

  addSubtitle(doc, 'Waarom cijfers schommelen');
  addParagraph(doc, `Webshop-cijfers zijn van nature volatiel. Dit betekent dat ze veel bewegen, op en neer gaan, zonder dat er een specifieke reden voor is. Maandag kan druk zijn, dinsdag rustig. De eerste week van de maand kan anders zijn dan de laatste. Feestdagen, het weer, nieuws, social media trends – alles beïnvloedt hoe mensen online winkelen.`);

  addParagraph(doc, `Dit is geen probleem. Dit is normaal. Grote retailers met miljarden aan omzet zien ook dagelijks schommelingen. Het verschil is dat zij kijken naar maandelijkse en kwartaalcijfers, niet naar elk uur. Jij mag dat ook doen. Sterker nog: dat moet je doen. Anders maak je jezelf gek met data die op korte termijn weinig betekent.`);

  addParagraph(doc, `Een goede vuistregel: bekijk je cijfers maximaal één keer per dag, bij voorkeur 's avonds. En trek pas conclusies na minimaal een week aan data. Alles daaronder is ruis, geen signaal.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 2 - HET DASHBOARD BOVENIN
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 2 – Het Dashboard Bovenin', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'De belangrijkste cijfers op een rij');
  addParagraph(doc, `Wanneer je inlogt in de admin, zie je bovenaan een dashboard met de belangrijkste cijfers. Dit is je snelle overzicht, je "pulse check" van de webshop. Je ziet hier typisch: het aantal bezoekers (vandaag of deze week), de omzet, het aantal orders, en soms extra metrics zoals conversieratio of gemiddelde orderwaarde.`);

  addParagraph(doc, `Het is belangrijk om te begrijpen wat elk cijfer betekent, maar nog belangrijker om te begrijpen wat het NIET betekent. Een getal is een momentopname. Het zegt iets over nu, maar niet over morgen. En het zegt al helemaal niets over jouw waarde als ondernemer of de kwaliteit van je producten.`);

  addSubtitle(doc, 'Bezoekers: wat betekent dit echt?');
  addParagraph(doc, `Het aantal bezoekers toont hoeveel unieke mensen je webshop hebben bezocht in een bepaalde periode. Dit lijkt een simpel cijfer, maar er zit nuance in. Een "bezoeker" is iemand die minimaal één pagina heeft geladen. Dit kan iemand zijn die tien minuten door je producten heeft gekeken, maar ook iemand die per ongeluk op een link klikte en direct weer weg was.`);

  addParagraph(doc, `Lage bezoekersaantallen zijn normaal voor nieuwe webshops. Je hebt nog geen grote naamsbekendheid, je advertenties zijn nog aan het leren, en organisch verkeer via Google kost maanden om op te bouwen. Zie de eerste maanden als een investering in de toekomst, niet als bewijs dat iets niet werkt.`);

  addSubtitle(doc, 'Omzet: waarom nullen normaal zijn');
  addParagraph(doc, `Je omzet-getal toont hoeveel euro er is binnengekomen via bestellingen. In het begin zal dit vaak nul zijn. Dat is niet erg. Elke webshop, hoe succesvol ook, begon ooit met nul omzet. De vraag is niet "waarom is het nul?" maar "wat doe ik om het te laten groeien?"`);

  addParagraph(doc, `Een dag met nul omzet is geen mislukking. Een week met nul omzet is een signaal om naar je verkeer en conversie te kijken, maar nog steeds geen reden voor paniek. Pas als je consistent verkeer hebt (bijvoorbeeld 100+ bezoekers per dag) en nog steeds geen conversies ziet, is het tijd om te onderzoeken wat er verbeterd kan worden.`);

  addSubtitle(doc, 'Orders: het hart van je webshop');
  addParagraph(doc, `Het aantal orders is misschien wel het meest bevredigende cijfer om te zien stijgen. Elke order is een klant die genoeg vertrouwen had om daadwerkelijk te kopen. Maar ook hier geldt: lage aantallen zijn normaal. De gemiddelde conversieratio voor e-commerce ligt tussen de 1% en 3%. Dit betekent dat van elke 100 bezoekers, slechts 1 tot 3 mensen iets kopen.`);

  addParagraph(doc, `Als je vandaag 20 bezoekers had en geen orders, is dat statistisch volkomen normaal. Je had 20 tot 60 bezoekers nodig voor de kans op één order. Dit is geen falen, dit is wiskunde.`);

  addSubtitle(doc, 'Trends vs. momentopnames');
  addParagraph(doc, `De allerbelangrijkste les over je dashboard: focus op trends, niet op momentopnames. Een trend is een patroon over tijd. Stijgt je bezoekersaantal gemiddeld over de weken? Dat is goed. Daalt je conversieratio consistent over een maand? Dat verdient aandacht.`);

  addParagraph(doc, `Maar een enkel slecht moment – een dag zonder orders, een uur zonder bezoekers, een week met minder omzet – zegt weinig. Kijk altijd naar minimaal 7 dagen data voordat je conclusies trekt. En vergelijk met dezelfde periode vorige maand, niet met gisteren.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 3 - ICONEN & SYMBOLEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 3 – Iconen & Symbolen', 18);
  addSpace(doc, 5);

  addParagraph(doc, `In je admin-omgeving zie je veel iconen en symbolen. Dit hoofdstuk legt elk belangrijk icoon uit in gewone taal, zodat je altijd weet wat je ziet en of je actie moet ondernemen.`);

  addSubtitle(doc, '📦 Doos / Producten');
  addParagraph(doc, `Dit icoon verwijst naar je productcatalogus. Hier beheer je alle items die in je webshop te koop zijn. Als je dit icoon ziet met een getal, toont het hoeveel producten actief zijn. Je hoeft hier alleen te kijken als je producten wilt toevoegen, bewerken of verwijderen. Dagelijks controleren is niet nodig.`);

  addParagraph(doc, `Wat normaal is: producten staan er gewoon. Wat aandacht vraagt: als producten plotseling verdwenen zijn of als je een foutmelding ziet bij het openen. Dit is zeldzaam.`);

  addSubtitle(doc, '🛒 Winkelwagen');
  addParagraph(doc, `Het winkelwagen-icoon toont activiteit rondom toevoegingen aan de winkelwagen. Dit is een positief signaal: het betekent dat bezoekers geïnteresseerd genoeg waren om iets te selecteren. Niet iedereen die iets aan de wagen toevoegt, koopt ook daadwerkelijk. Dat is normaal. Mensen vergelijken, twijfelen, en komen soms later terug.`);

  addParagraph(doc, `Je hoeft niets te doen als dit getal laag is. Focus op het krijgen van meer bezoekers; de winkelwagen-acties volgen vanzelf.`);

  addSubtitle(doc, '🕐 Klok / Tijd');
  addParagraph(doc, `Een klok-icoon duidt vaak op tijdgebonden informatie: recente activiteit, geplande acties, of verwerkingstijd. Dit is puur informatief. Tenzij er een waarschuwing bij staat, hoef je hier niets mee te doen.`);

  addSubtitle(doc, '🔔 Bel / Meldingen');
  addParagraph(doc, `De bel toont meldingen of notificaties. Dit kunnen updates zijn over orders, systeemmeldingen, of aandachtspunten. Niet elke melding vraagt actie. Veel meldingen zijn informatief: "Er is een nieuwe order" of "Synchronisatie voltooid." Lees ze, maar raak niet in paniek.`);

  addParagraph(doc, `Alleen meldingen met rode kleur of het woord "fout" of "error" vragen mogelijk om actie. En zelfs dan: lees eerst rustig wat er staat voordat je iets doet.`);

  addSubtitle(doc, '📊 Grafiek / Statistieken');
  addParagraph(doc, `Grafieken tonen trends over tijd. Dit is waar je de echte waarde haalt: niet uit individuele getallen, maar uit de richting van de lijn. Gaat de lijn gemiddeld omhoog over weken? Uitstekend. Is er een dip? Kijk of het een patroon is of een eenmalige gebeurtenis.`);

  addParagraph(doc, `Tip: zoom altijd uit naar minimaal 7 of 30 dagen. Daggrafieken zijn te volatiel om conclusies uit te trekken.`);

  addSubtitle(doc, '💶 Euro / Omzet');
  addParagraph(doc, `Het euro-symbool verwijst naar financiële data: omzet, betalingen, of gemiddelde orderwaarde. Dit is het cijfer waar veel ondernemers naar staren, maar onthoud: omzet is een resultaat, geen oorzaak. Focus op de oorzaken (verkeer, conversie, productaanbod) en de omzet volgt.`);

  addSubtitle(doc, '👁 Oog / Bezoekers');
  addParagraph(doc, `Het oog-icoon representeert bezoekers of pageviews. Dit toont interesse in je winkel. Meer ogen is goed, maar de kwaliteit van bezoekers is belangrijker dan de kwantiteit. Honderd gerichte bezoekers via een goede advertentie zijn meer waard dan duizend willekeurige bezoekers.`);

  addSubtitle(doc, '🌐 Wereldbol / Locaties');
  addParagraph(doc, `De wereldbol toont geografische data: waar komen je bezoekers vandaan? Dit is interessant voor analyse, maar vraagt zelden actie. Als je alleen in de VS verkoopt en ziet dat je bezoekers ook vooral uit de VS komen, is alles in orde.`);

  addPageNumber(doc);
  startNewPage(doc);

  addSubtitle(doc, '⚠️ Waarschuwing / Driehoek');
  addParagraph(doc, `Een gele of oranje driehoek is een waarschuwing. Dit betekent niet automatisch dat er iets mis is, maar dat het systeem denkt dat je ergens naar moet kijken. Lees de bijbehorende tekst. Vaak is het informatief: "Product heeft lage voorraad" of "Lange laadtijd gedetecteerd."`);

  addParagraph(doc, `Niet elke waarschuwing is urgent. Prioriteer op basis van impact. Een waarschuwing over een traag ladend plaatje is minder urgent dan een waarschuwing over een betaalfout.`);

  addSubtitle(doc, '✅ Checkmark / Succes');
  addParagraph(doc, `Een groen vinkje betekent: alles in orde. Dit zie je bij succesvolle acties, voltooide synchronisaties, of goedgekeurde betalingen. Hier hoef je niets mee te doen. Het is bevestiging dat het systeem werkt zoals het hoort.`);

  addSubtitle(doc, '🔄 Refresh / Synchronisatie');
  addParagraph(doc, `Cirkelende pijlen duiden op synchronisatie of verversing. Dit betekent dat data wordt bijgewerkt. Je ziet dit bij het laden van nieuwe informatie of het synchroniseren met externe systemen zoals je dropshipping-leverancier.`);

  addParagraph(doc, `Wacht rustig tot de synchronisatie klaar is. Als het langer dan een paar minuten duurt, kun je de pagina verversen. Meestal lost het zichzelf op.`);

  addSubtitle(doc, '🔀 Funnel / Trechter');
  addParagraph(doc, `Een trechter-icoon toont je conversie-funnel: hoeveel bezoekers gaan van de homepage naar productpagina naar winkelwagen naar checkout naar betaling. Het is normaal dat bij elke stap mensen afhaken. Een gezonde funnel verliest 50-80% bij elke stap. Dat klinkt veel, maar het is standaard voor e-commerce.`);

  addSubtitle(doc, '🔥 Heatmap / Warmte');
  addParagraph(doc, `Als je heatmap-data ziet, toont dit waar bezoekers klikken of scrollen. Rode zones zijn populair, blauwe zones worden genegeerd. Dit is nuttig voor optimalisatie, maar niet iets waar je je dagelijks druk om hoeft te maken. Bekijk het eens per maand als je wilt verbeteren.`);

  addSubtitle(doc, '📈 Analytics / Analyse');
  addParagraph(doc, `Het analytics-icoon leidt naar gedetailleerde statistieken. Hier kun je dieper graven in je data. Dit is voor wanneer je specifieke vragen hebt, niet voor dagelijks gebruik. Te veel analyseren leidt tot over-denken. Vertrouw op je samenvattende dashboard voor het dagelijks overzicht.`);

  addSubtitle(doc, '📣 Advertenties / Megafoon');
  addParagraph(doc, `Dit icoon verwijst naar je advertentie-instellingen of -resultaten. Advertenties hebben tijd nodig om te leren. Beoordeel campagnes pas na minimaal 7 dagen actief draaien met voldoende budget. Eerder conclusies trekken is zinloos.`);

  addSubtitle(doc, '⚙️ Instellingen / Tandwiel');
  addParagraph(doc, `Het tandwiel leidt naar configuratie-opties. Hier kun je je webshop aanpassen. Wees voorzichtig met instellingen die je niet begrijpt. Als iets werkt, hoef je het niet aan te passen. Vraag hulp bij twijfel.`);

  addParagraph(doc, `Algemene regel voor alle iconen: als er geen rode kleur, geen woord "fout" of "error", en geen expliciete oproep tot actie bij staat, dan hoef je waarschijnlijk niets te doen. Je mag kijken, leren, en verder gaan met je dag.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 4 - BEZOEKERSGEDRAG
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 4 – Bezoekersgedrag', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'Kijken zonder kopen: de realiteit van e-commerce');
  addParagraph(doc, `Laten we beginnen met een belangrijke waarheid: de overgrote meerderheid van je bezoekers zal niet kopen. Dit is geen falen van jouw webshop; dit is hoe online winkelen werkt. Studies tonen consistent dat slechts 1-3% van e-commerce bezoekers daadwerkelijk een aankoop doet. Dit betekent dat van elke 100 mensen die je site bezoeken, 97 tot 99 vertrekken zonder iets te kopen.`);

  addParagraph(doc, `Waarom? Omdat online shoppen fundamenteel anders is dan een fysieke winkel. In een fysieke winkel is iemand die binnenloopt al behoorlijk gecommitteerd – ze hebben moeite gedaan om erheen te gaan. Online kost het één klik om ergens te landen en één klik om weer te vertrekken. Mensen browsen, vergelijken, bookmarken voor later, laten zich afleiden, of realiseren zich simpelweg dat ze het product nu niet nodig hebben.`);

  addSubtitle(doc, 'Het twijfel-proces');
  addParagraph(doc, `Een gemiddelde consument bezoekt een webshop meerdere keren voordat ze kopen. Dit heet de "customer journey" en kan dagen of zelfs weken duren. Iemand ziet misschien vandaag een advertentie, bezoekt je site, kijkt rond, en vertrekt. Morgen denken ze eraan terug. Overmorgen googelen ze je productnaam. Volgende week, als ze salaris hebben ontvangen, komen ze terug en kopen.`);

  addParagraph(doc, `Dit betekent dat een bezoeker die vandaag niet koopt, niet een gemiste kans is – het is een potentiële klant in wording. Je admin toont je de eerste bezoeken, maar niet de mentale reis die daarna plaatsvindt. Vertrouw erop dat het proces werkt, ook als je het niet direct ziet.`);

  addSubtitle(doc, 'Terugkerende bezoekers');
  addParagraph(doc, `Als je in je analytics ziet dat mensen terugkeren naar je site, is dat een uitstekend teken. Het betekent dat je winkel interessant genoeg is om te onthouden. Terugkerende bezoekers hebben een veel hogere kans om te converteren dan nieuwe bezoekers. Ze zijn al bekend met je merk, hebben je producten gezien, en komen terug met meer koopintentie.`);

  addParagraph(doc, `Moedig dit aan door een goede ervaring te bieden bij het eerste bezoek. Geen opdringerige pop-ups, geen verwarrende navigatie, geen gebroken links. Laat mensen rustig rondkijken, zodat ze met een positief gevoel vertrekken en terugkomen.`);

  addSubtitle(doc, 'Waarom 90% niet koopt – en dat gezond is');
  addParagraph(doc, `Het zou eng zijn als 90% van je bezoekers wél kocht. Dat zou betekenen dat je óf te weinig bezoekers hebt, óf dat er iets vreemds aan de hand is met je data. Een gezonde webshop heeft veel meer kijkers dan kopers. Dit is het digitale equivalent van mensen die een etalage bekijken versus mensen die de winkel binnenstappen.`);

  addParagraph(doc, `Je doel is niet om iedereen te converteren. Je doel is om de juiste mensen te converteren – degenen die echt geïnteresseerd zijn in wat je verkoopt en de middelen hebben om te kopen. Focus op het aantrekken van deze doelgroep via gerichte marketing, en de conversies volgen.`);

  addParagraph(doc, `Onthoud ook dat elke bezoeker, zelfs degenen die niet kopen, waarde hebben. Ze leren je merk kennen. Misschien vertellen ze het door aan iemand anders. Misschien komen ze later terug voor een cadeau. De impact van een bezoek is niet altijd direct meetbaar, maar het draagt bij aan je merkbekendheid.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 5 - PRODUCTEN & CATEGORIEËN
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 5 – Producten & Categorieën', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'De structuur van je productcatalogus');
  addParagraph(doc, `Je webshop heeft een hiërarchische structuur van categorieën en producten. Dit helpt bezoekers navigeren en vinden wat ze zoeken. Maar deze structuur kan soms verwarrend lijken in de admin, vooral als je ziet dat sommige categorieën "leeg" zijn.`);

  addSubtitle(doc, 'Lege categorieën met subcategorieën');
  addParagraph(doc, `Het is volkomen normaal en correct dat een hoofdcategorie zelf geen producten bevat, maar alleen subcategorieën. Bijvoorbeeld: de categorie "Hondenvoeding" kan leeg zijn, terwijl de subcategorieën "Droogvoer", "Natvoer" en "Snacks" wél producten bevatten. Dit is geen fout – dit is goede organisatie.`);

  addParagraph(doc, `In je admin zie je misschien "0 producten" naast zo'n hoofdcategorie. Dit is correct. De producten zitten een niveau dieper, in de subcategorieën. Je hoeft hier niets aan te veranderen.`);

  addSubtitle(doc, 'Waarom "0 producten" niet altijd fout is');
  addParagraph(doc, `Er zijn meerdere geldige redenen waarom een categorie nul producten kan tonen. De producten kunnen in subcategorieën zitten, zoals hierboven uitgelegd. Of de categorie is nieuw en wordt nog gevuld. Of het is een seizoensgebonden categorie die tijdelijk leeg is. Of het is een placeholder voor toekomstige uitbreiding.`);

  addParagraph(doc, `Pas als een categorie producten zou moeten bevatten én zichtbaar is voor klanten én leeg is, is er mogelijk een probleem. Controleer in dat geval of de producten correct zijn toegewezen en of ze op "actief" staan.`);

  addSubtitle(doc, 'Hoe dropshipping-structuren werken');
  addParagraph(doc, `Bij dropshipping heb je een leverancier die de producten beheert en levert. Jouw webshop toont deze producten, maar de fysieke voorraad ligt bij de leverancier. Dit betekent dat producten soms automatisch worden bijgewerkt: nieuwe producten verschijnen, prijzen veranderen, of items worden uitgeschakeld als de leverancier ze niet meer heeft.`);

  addParagraph(doc, `Dit is een voordeel – je hoeft geen voorraad te beheren. Maar het betekent ook dat je soms veranderingen ziet in je productcatalogus die je niet zelf hebt gemaakt. Dit is normaal en onderdeel van hoe dropshipping werkt. Controleer periodiek of je bestsellers nog beschikbaar zijn, maar maak je geen zorgen over kleine fluctuaties in je totale productaantal.`);

  addSubtitle(doc, 'Wanneer iets wél een probleem is');
  addParagraph(doc, `Een probleem met producten of categorieën herken je aan: klanten die klagen dat ze iets niet kunnen vinden, producten die niet laden op je website, categorieën die volledig verdwenen zijn terwijl ze er wel zouden moeten zijn, of foutmeldingen bij het bewerken van producten.`);

  addParagraph(doc, `Als je dit ziet, is het tijd om te onderzoeken. Maar preventief controleren of elk product perfect staat is niet nodig. Vertrouw op je systeem en grijp in wanneer er concrete signalen zijn.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 6 - VOORRAAD & OUT OF STOCK
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 6 – Voorraad & Out of Stock', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'Het verschil tussen fysieke voorraad en dropshipping');
  addParagraph(doc, `Bij een traditionele webshop heb je producten liggen in een magazijn. Je weet precies hoeveel je hebt, en als het op is, is het op. Bij dropshipping is dit anders. Je "voorraad" is eigenlijk de voorraad van je leverancier. Jij houdt geen fysieke producten aan – je stuurt bestellingen door naar de leverancier die direct naar de klant verstuurt.`);

  addParagraph(doc, `Dit betekent dat voorraadcijfers in je admin anders werken. Een product met "0 voorraad" in een dropshipping-model betekent niet altijd dat het uitverkocht is. Het kan betekenen dat de synchronisatie nog loopt, dat de leverancier tijdelijk geen live data stuurt, of dat het product een andere voorraadlogica gebruikt.`);

  addSubtitle(doc, 'Waarom stock = 0 niet per se "uitverkocht" is');
  addParagraph(doc, `Er zijn technische redenen waarom een product nul voorraad kan tonen terwijl het wel beschikbaar is. Sommige leveranciers werken met "infinite stock" – ze geven geen specifiek aantal door, wat het systeem interpreteert als nul. Andere leveranciers updaten hun voorraad alleen op bepaalde momenten, waardoor er tijdelijk nul staat.`);

  addParagraph(doc, `De echte vraag is: kunnen klanten het product kopen op je website? Als de "In winkelwagen" knop werkt en er geen "Uitverkocht" melding staat, dan is het product beschikbaar – ongeacht wat de admin zegt. De klantervaring is wat telt.`);

  addSubtitle(doc, 'Wanneer een product echt uitgeschakeld is');
  addParagraph(doc, `Een product is echt niet beschikbaar wanneer: het expliciet op "Uitverkocht" staat op de website, de "Koop" knop niet werkt, of het product niet meer zichtbaar is in de catalogus. Dit zijn de signalen die tellen, niet het voorraadcijfer in je admin.`);

  addParagraph(doc, `Als een bestseller plotseling niet meer te koop is, controleer dan eerst of het aan de leverancierszijde ligt. Neem contact op met je leverancier of check hun catalogus. Vaak is het een tijdelijke situatie die zichzelf oplost, of kun je een alternatief product vinden.`);

  addSubtitle(doc, 'Praktische aanpak voor voorraadbeheer');
  addParagraph(doc, `Maak je niet gek met dagelijks voorraad checken. De meeste dropshipping-systemen werken automatisch. Producten die niet meer leverbaar zijn, worden vanzelf gemarkeerd of uitgeschakeld. Jouw taak is om periodiek (wekelijks) te controleren of je belangrijkste producten – je bestsellers en advertentie-producten – beschikbaar zijn.`);

  addParagraph(doc, `Voor de rest: vertrouw het systeem. Als er iets mis is, zul je het merken via klantfeedback of via waarschuwingen in je admin. Preventief elk product controleren is tijdverspilling en leidt alleen maar tot onnodige stress.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 7 - WINKELWAGEN & AFREKENEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 7 – Winkelwagen & Afrekenen', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'Add to Cart: het eerste positieve signaal');
  addParagraph(doc, `Wanneer een bezoeker iets aan de winkelwagen toevoegt, is dat een belangrijk moment. Het toont interesse, intentie, en betrokkenheid. Niet iedereen die iets toevoegt zal ook kopen – het gemiddelde afhaakpercentage bij de winkelwagen ligt rond de 70% – maar elke toevoeging is een stap in de goede richting.`);

  addParagraph(doc, `In je admin zie je hoeveel mensen iets hebben toegevoegd. Dit getal is positiever dan het aantal uiteindelijke orders. Het toont je dat bezoekers genoeg interesse hebben om actie te ondernemen. Als dit getal groeit, doe je iets goed.`);

  addSubtitle(doc, 'Checkout: de beslissende stap');
  addParagraph(doc, `Van winkelwagen naar checkout is waar mensen echt committeren. Ze vullen hun gegevens in, kiezen verzending, en bereiden zich voor op betaling. Hier haakt opnieuw een percentage af, maar degenen die doorzetten hebben serieuze koopintentie.`);

  addParagraph(doc, `Je checkout-proces moet soepel zijn. Geen verrassingen, geen onduidelijke kosten, geen ingewikkelde formulieren. Hoe minder wrijving, hoe meer mensen doorzetten. Als je merkt dat veel mensen de checkout beginnen maar niet afronden, kan het lonen om je checkout-pagina te bekijken. Maar dit is optimalisatie voor later – in het begin focus je op verkeer krijgen.`);

  addSubtitle(doc, 'Wanneer testen voldoende is');
  addParagraph(doc, `Je hoeft je checkout niet dagelijks te controleren. Wel is het slim om periodiek – bijvoorbeeld maandelijks – een testbestelling te plaatsen. Dit betekent dat je zelf door het proces gaat, tot aan het punt van betaling. Je hoeft niet echt te betalen, maar je controleert of elke stap werkt.`);

  addParagraph(doc, `Als je eenmaal hebt bevestigd dat de checkout werkt, kun je erop vertrouwen. Moderne e-commerce systemen zijn robuust. Tenzij je grote veranderingen maakt aan je site, blijft de checkout werken.`);

  addSubtitle(doc, 'Wanneer je je geen zorgen hoeft te maken');
  addParagraph(doc, `Maak je geen zorgen als: je lage add-to-cart cijfers ziet terwijl je ook laag verkeer hebt (dat is logisch), sommige mensen afhaken bij de checkout (dat is normaal), of het betalingsproces even duurt (verwerking kost tijd).`);

  addParagraph(doc, `Maak je wél zorgen als: klanten melden dat ze niet kunnen afrekenen, je betaalprovider problemen rapporteert, of je ziet dat letterlijk niemand voorbij een bepaald punt komt in de funnel. Dit zijn signalen om te onderzoeken.`);

  addParagraph(doc, `De vuistregel is: geen nieuws is goed nieuws. Als je geen klachten krijgt over het afrekenproces, werkt het waarschijnlijk. Besteed je energie aan het krijgen van meer bezoekers, niet aan het perfectioneren van een checkout die al functioneert.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 8 - ORDERS & BETALINGEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 8 – Orders & Betalingen', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'Wanneer er nog geen orders zijn');
  addParagraph(doc, `Als je net begint, zal je order-overzicht leeg zijn. Dit is volkomen normaal. Elke succesvolle webshop begon met een lege orderpagina. De eerste order is een mijlpaal die je moet vieren, niet iets dat je vanaf dag één moet verwachten.`);

  addParagraph(doc, `Een lege orderpagina is geen indicatie dat er iets mis is. Het betekent simpelweg dat je nog geen kopers hebt gehad. De oorzaken kunnen zijn: te weinig bezoekers (focus op marketing), verkeerde doelgroep (verfijn je targeting), of het is gewoon nog te vroeg (geef het tijd).`);

  addSubtitle(doc, 'De anatomie van een order');
  addParagraph(doc, `Wanneer je eerste order binnenkomt, zie je een record met informatie: klantnaam, adres, bestelde producten, totaalbedrag, en status. De status vertelt je waar de order zich bevindt in het proces: betaald, in verwerking, verzonden, of afgeleverd.`);

  addParagraph(doc, `Bij dropshipping wordt de order automatisch doorgestuurd naar je leverancier. Je hoeft zelf niets te verpakken of versturen. Je ziet de status veranderen naarmate de leverancier de order verwerkt en verstuurt.`);

  addSubtitle(doc, 'Hoe betalingen binnenkomen');
  addParagraph(doc, `Betalingen verlopen via je betaalprovider. Wanneer een klant betaalt, gaat het geld eerst naar de betaalprovider, die het later naar jouw rekening overmaakt. Dit kan een paar dagen duren, afhankelijk van je provider en instellingen.`);

  addParagraph(doc, `Het is normaal dat je een vertraging ziet tussen een order en het daadwerkelijk ontvangen van geld. Dit is geen probleem – het is hoe het systeem werkt. Controleer je betaalprovider dashboard voor details over uitbetalingen.`);

  addSubtitle(doc, 'Wanneer ingrijpen nodig is');
  addParagraph(doc, `Je hoeft bij de meeste orders niets te doen. Het systeem werkt automatisch. Maar er zijn situaties waarin actie nodig is: een klant vraagt om annulering (verwerk dit snel), een betaling is mislukt maar de order is aangemaakt (contacteer de klant), of de leverancier meldt een probleem met de levering (communiceer proactief met je klant).`);

  addParagraph(doc, `Goede klantenservice bij problemen bouwt vertrouwen. Een klant die een goed afgehandeld probleem ervaart, wordt vaak loyaler dan een klant die nooit een probleem had. Zie problemen als kansen.`);

  addSubtitle(doc, 'Wanneer niet ingrijpen');
  addParagraph(doc, `Je hoeft niet in te grijpen bij: elke nieuwe order (die lopen automatisch), normale doorlooptijden (geduld), of kleine variaties in status (dat regelt het systeem). Vertrouw op je processen en grijp alleen in bij expliciete problemen of klantverzoeken.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 9 - VERZENDING & STATUSSEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 9 – Verzending & Statussen', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'Het verwerkingsproces');
  addParagraph(doc, `Nadat een order is geplaatst en betaald, begint de verwerking. Bij dropshipping betekent dit dat de order wordt doorgestuurd naar je leverancier. De leverancier pakt het product, bereidt het voor verzending, en geeft het af aan een bezorgdienst.`);

  addParagraph(doc, `Dit proces kost tijd. Rekenen op 1-3 werkdagen voor verwerking is realistisch. Sommige leveranciers zijn sneller, andere trager. Dit is normaal en onderdeel van het dropshipping-model. Communiceer realistische verwachtingen naar je klanten.`);

  addSubtitle(doc, 'Levertijden: verwachting vs. realiteit');
  addParagraph(doc, `Levertijden variëren afhankelijk van: waar je leverancier is gevestigd, welke bezorgdienst wordt gebruikt, en waar je klant woont. Voor verzending binnen de VS kun je typisch 5-10 werkdagen rekenen, soms sneller met premium opties.`);

  addParagraph(doc, `Het belangrijkste is om eerlijke verwachtingen te scheppen. Als je website "5-10 werkdagen" vermeldt en de klant ontvangt binnen 7 dagen, is iedereen tevreden. Als je "2 dagen" belooft en het duurt een week, krijg je klachten – ook al is een week objectief gezien snel.`);

  addSubtitle(doc, 'Tracking: wat klanten willen weten');
  addParagraph(doc, `Klanten willen weten waar hun pakket is. Een tracking-code stelt hen gerust. Bij dropshipping ontvang je de tracking-code van je leverancier, die je doorstuurt naar de klant. Dit kan automatisch gaan via je systeem.`);

  addParagraph(doc, `Soms duurt het even voordat tracking-informatie beschikbaar is. Leg dit uit in je verzendmail: "Je ontvangt een tracking-code zodra je pakket is verzonden. Dit kan 1-2 werkdagen duren." Zo voorkom je onnodige vragen.`);

  addSubtitle(doc, 'Klantverwachting managen');
  addParagraph(doc, `De meeste problemen met verzending zijn eigenlijk problemen met verwachtingen. Klanten die weten wat ze kunnen verwachten, zijn geduldig. Klanten die in het duister tasten, worden ongerust en klagen.`);

  addParagraph(doc, `Communiceer dus proactief: stuur een bevestigingsmail bij bestelling, een update bij verzending met tracking, en wees bereikbaar voor vragen. Dit kost je weinig moeite maar maakt een groot verschil in klanttevredenheid.`);

  addSubtitle(doc, 'Wat te doen bij vertragingen');
  addParagraph(doc, `Vertragingen gebeuren. Drukte bij de bezorgdienst, douane-controles, onvoorziene omstandigheden. Als een pakket later is dan verwacht, contacteer de klant proactief. Excuseer voor het ongemak, leg uit wat je weet, en bied waar mogelijk compensatie aan (korting op volgende bestelling).`);

  addParagraph(doc, `Klanten waarderen eerlijkheid. Een simpele mail met "Je pakket is vertraagd, we houden je op de hoogte" is beter dan stilte. Stilte kweekt wantrouwen; communicatie bouwt vertrouwen.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 10 - MARKETING & ADVERTENTIES
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 10 – Marketing & Advertenties', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'Waarom advertenties tijd nodig hebben');
  addParagraph(doc, `Online advertenties zijn geen lichtschakelaar. Je zet ze niet aan en krijgt direct verkopen. Advertentieplatforms zoals Facebook, Instagram en Google hebben een "leerfase" nodig. Tijdens deze fase verzamelt het algoritme data over wie er op je ads klikt, wie doorgaat naar je site, en wie koopt.`);

  addParagraph(doc, `Deze leerfase duurt typisch 3-7 dagen, soms langer. Gedurende deze periode zul je kosten zien zonder proportionele resultaten. Dat is normaal. Het systeem investeert in het vinden van je ideale klanten.`);

  addSubtitle(doc, 'De leercurve accepteren');
  addParagraph(doc, `De grootste fout die nieuwe adverteerders maken is te snel conclusies trekken. Na één dag met hoge kosten en geen verkopen, paniekeren ze en stoppen de campagne. Dit is contraproductief: je gooit de geleerde data weg en begint opnieuw van nul.`);

  addParagraph(doc, `Geef campagnes minimaal 7 dagen voordat je beoordeelt. Liever 14 dagen. In die tijd verzamelt het platform genoeg data om te optimaliseren. De kosten per resultaat dalen vaak significant na de leerfase.`);

  addSubtitle(doc, 'Dag 1 is geen meetpunt');
  addParagraph(doc, `De resultaten van dag 1 zeggen bijna niets. Je ziet misschien veel vertoningen, weinig klikken, en geen verkopen. Of juist omgekeerd. Dit is ruis, geen signaal. Het is alsof je een munt één keer opgooit en concludeert dat die altijd kop landt.`);

  addParagraph(doc, `Statistische significantie vereist volume. Je hebt honderden klikken nodig voordat je trends kunt zien, en duizenden vertoningen voor betrouwbare conclusies. Wees geduldig en verzamel data.`);

  addSubtitle(doc, 'Wanneer je NIET moet stoppen');
  addParagraph(doc, `Stop niet met adverteren omdat: de eerste dagen duur zijn (dat is de leerfase), je geen directe verkopen ziet (attributie is complex), of het "niet voelt" alsof het werkt (gevoel is geen data).`);

  addParagraph(doc, `Stop wél als: je na 14 dagen met voldoende budget nog steeds nul resultaat ziet, je kosten structureel hoger zijn dan je marges toestaan, of je advertentiemateriaal duidelijk niet werkt (0% click-through rate).`);

  addSubtitle(doc, 'Het grote plaatje');
  addParagraph(doc, `Marketing is een marathon, geen sprint. Succesvolle webshops bouwen maanden aan hun advertentiestrategieën. Ze testen, leren, optimaliseren, en herhalen. Verwacht geen instant succes; werk naar duurzame groei.`);

  addParagraph(doc, `Je investering in advertenties is ook een investering in merkbekendheid. Zelfs mensen die niet kopen, leren je merk kennen. Die bekendheid betaalt zich uit over tijd. Denk in kwartalen, niet in dagen.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 11 - ANALYTICS & CIJFERS LEZEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 11 – Analytics & Cijfers Lezen', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'AOV: Average Order Value');
  addParagraph(doc, `AOV (gemiddelde orderwaarde) vertelt je hoeveel een klant gemiddeld per bestelling uitgeeft. Je berekent het door je totale omzet te delen door het aantal orders. Als je €1000 omzet hebt met 20 orders, is je AOV €50.`);

  addParagraph(doc, `Een hogere AOV is meestal beter – je verdient meer per transactie. Je kunt AOV verhogen door: duurdere producten toe te voegen, bundels aan te bieden, drempels voor gratis verzending te zetten, of upsells toe te voegen bij de checkout.`);

  addSubtitle(doc, 'CTR: Click-Through Rate');
  addParagraph(doc, `CTR toont hoeveel procent van de mensen die je advertentie zien, ook daadwerkelijk klikken. Een CTR van 2% betekent dat van elke 100 mensen die je ad zien, 2 erop klikken. Gemiddelde CTR's variëren per platform en industrie, maar 1-3% is typisch voor e-commerce ads.`);

  addParagraph(doc, `Lage CTR kan betekenen: verkeerde doelgroep, niet-aansprekende beelden, of zwakke copywriting. Maar trek geen conclusies op kleine aantallen. Een CTR van 0.5% na 100 vertoningen is niet significant; na 10.000 vertoningen wel.`);

  addSubtitle(doc, 'Conversieratio');
  addParagraph(doc, `Conversieratio is het percentage bezoekers dat koopt. Als 100 mensen je site bezoeken en 2 kopen, is je conversie 2%. Voor e-commerce is 1-3% gemiddeld, 3-5% is goed, en alles boven 5% is excellent.`);

  addParagraph(doc, `Een lage conversieratio kan liggen aan: verkeerde bezoekers (marketing), slechte gebruikerservaring (website), niet-concurrerende prijzen, of gebrek aan vertrouwen. Maar eerst: heb je genoeg bezoekers voor betrouwbare data? Met 50 bezoekers kun je geen conclusies trekken over conversie.`);

  addSubtitle(doc, 'Add-to-Cart Rate');
  addParagraph(doc, `Dit toont hoeveel procent van bezoekers iets aan de winkelwagen toevoegt. Het is een earlier-funnel metric dan conversie. Een gemiddelde add-to-cart rate voor e-commerce ligt rond 5-15%, afhankelijk van de industrie.`);

  addParagraph(doc, `Als je add-to-cart rate goed is maar conversie laag, ligt het probleem na de winkelwagen (checkout, verzendkosten, betalingsopties). Als je add-to-cart rate laag is, ligt het probleem eerder (productpresentatie, prijs, aanbod).`);

  addSubtitle(doc, 'Trends vs. pieken');
  addParagraph(doc, `De belangrijkste les: focus op trends, niet op pieken. Een piek is een uitzondering – een dag met ongewoon hoge of lage cijfers. Een trend is een patroon over tijd. Pieken zijn interessant maar niet actionable. Trends zijn waar je je strategie op baseert.`);

  addParagraph(doc, `Bekijk altijd grafieken over minimaal 7 dagen, liever 30. Vergelijk met dezelfde periode vorige maand. Zoek naar consistente bewegingen, niet naar individuele uitschieters. Een slechte dinsdag betekent niets; een dalende trend over 4 weken vraagt aandacht.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 12 - WANNEER INGRIJPEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 12 – Wanneer Ingrijpen', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'Signalen dat actie nodig is');
  addParagraph(doc, `Niet alles in je admin vraagt actie, maar sommige situaties wel. Hier zijn de belangrijkste signalen dat je iets moet doen:`);

  addParagraph(doc, `Klanten kunnen niet afrekenen. Als meerdere klanten melden dat de checkout niet werkt, of je ziet dat niemand voorbij de betalingspagina komt, is dat kritiek. Test zelf de checkout en neem contact op met je betaalprovider als nodig.`);

  addParagraph(doc, `Je bestseller is niet beschikbaar. Als een product dat verantwoordelijk is voor een groot deel van je verkopen plotseling "uitverkocht" of onzichtbaar is, verlies je omzet. Onderzoek waarom en los het snel op.`);

  addParagraph(doc, `Advertenties branden geld zonder klikken. Als je ads duizenden vertoningen hebben maar letterlijk nul klikken (na 3+ dagen), is er iets mis met je targeting of advertentiemateriaal. Pauzeer en heroverweeg.`);

  addSubtitle(doc, 'Wat echte fouten zijn');
  addParagraph(doc, `Echte fouten herken je aan: foutmeldingen met codes (404, 500, error), processen die compleet niet werken (niet "langzaam" maar "broken"), meerdere klanten met hetzelfde probleem, of financiële data die niet klopt (betalingen die niet doorkomen).`);

  addParagraph(doc, `Dit zijn geen normale fluctuaties. Dit zijn problemen die aandacht verdienen. Log ze, onderzoek ze, en los ze op. Bij technische fouten die je niet begrijpt, vraag om hulp.`);

  addSubtitle(doc, 'Wat ruis is');
  addParagraph(doc, `Ruis is alles wat normaal is maar er eng uitziet. Voorbeelden: een dag met minder bezoekers dan gisteren (normaal), één klant die klaagt terwijl anderen tevreden zijn (outlier), advertentiekosten die schommelen per dag (normaal), een lege orderpagina in de eerste weken (normaal).`);

  addParagraph(doc, `Ruis vraagt geen actie. Het vraagt observatie en geduld. Noteer het, kijk of het een patroon wordt, en grijp pas in als er een duidelijke trend is.`);

  addSubtitle(doc, 'De gouden regel');
  addParagraph(doc, `Vraag jezelf altijd af: is dit een incident of een patroon? Incidenten kun je negeren of noteren. Patronen vragen actie. Een incident is één datapunt. Een patroon is meerdere datapunten in dezelfde richting. Eén dag zonder orders is een incident. Twee weken zonder orders terwijl je verkeer hebt, is een patroon.`);

  addParagraph(doc, `Door dit onderscheid te maken, bespaar je jezelf veel onnodige stress en neem je betere beslissingen wanneer actie wél nodig is.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 13 - WANNEER NIETS DOEN
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 13 – Wanneer Niets Doen', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'De kracht van niets doen');
  addParagraph(doc, `Dit is misschien wel het belangrijkste hoofdstuk in deze hele handleiding. De meeste beginners maken niet de fout dat ze te weinig doen – ze doen te veel. Ze sleutelen, veranderen, optimaliseren, en eindigen met een webshop die in constante flux is, zonder ooit de kans te krijgen om te stabiliseren.`);

  addParagraph(doc, `Niets doen is soms de meest professionele keuze. Het betekent: vertrouwen dat je systemen werken, data laten accumuleren voordat je conclusies trekt, en weerstand bieden tegen de neiging om bij elke kleine schommeling in paniek te raken.`);

  addSubtitle(doc, 'Waarom niet constant aanpassen beter is');
  addParagraph(doc, `Elke verandering die je maakt, verstoort je data. Als je vandaag je homepage aanpast, kun je de conversie van gisteren niet meer vergelijken met die van morgen – want je weet niet of het verschil door de verandering komt of door andere factoren.`);

  addParagraph(doc, `Grote bedrijven testen veranderingen zorgvuldig met A/B-tests en wachten weken voordat ze conclusies trekken. Als individu kun je dat niet altijd doen, maar je kunt wél stoppen met het maken van veranderingen elke dag.`);

  addParagraph(doc, `Een stabiele webshop is een meetbare webshop. Veranderingen die je aanbrengt moeten doordacht, gedocumenteerd, en individueel getest zijn. Niet alles tegelijk, niet elke dag iets nieuws.`);

  addSubtitle(doc, 'Situaties waarin niets doen de juiste keuze is');
  addParagraph(doc, `Niets doen is juist wanneer: je cijfers schommelen maar geen duidelijke negatieve trend tonen, je net bent begonnen en nog geen maand data hebt, je advertenties nog in de leerfase zitten, je geen klachten van klanten krijgt, je systemen technisch functioneren.`);

  addParagraph(doc, `In al deze gevallen is geduld de beste strategie. Verzamel data, observeer, en wacht tot je een duidelijk beeld hebt voordat je ingrijpt.`);

  addSubtitle(doc, 'De paradox van succes');
  addParagraph(doc, `Veel succesvolle ondernemers bereiken hun succes niet door constant te optimaliseren, maar door de juiste dingen te doen en ze dan met rust te laten. Ze bouwen solide fundamenten en laten die hun werk doen.`);

  addParagraph(doc, `Jouw webshop is zo'n fundament. Het is gebouwd om te werken. Laat het werken. Kijk af en toe, check of alles functioneert, en ga dan verder met je leven. De webshop draait 24/7 – jij hoeft dat niet te doen.`);

  addParagraph(doc, `Onthoud: de meest succesvolle actie die je soms kunt ondernemen, is geen actie ondernemen. Vertrouw je systemen, vertrouw je producten, en vertrouw dat klanten je zullen vinden. Je mag ademhalen.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 14 - CHECKLISTS
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 14 – Dagelijkse & Wekelijkse Checklist', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'Dagelijkse check (5 minuten)');
  addParagraph(doc, `De dagelijkse check is minimaal en snel. Je doel is niet om alles te analyseren, maar om te verifiëren dat er geen brandjes zijn. Dit kun je 's ochtends of 's avonds doen, op een vast moment.`);

  addParagraph(doc, `1. Open je admin en bekijk het dashboard bovenin. Zijn er rode waarschuwingen of foutmeldingen? Zo niet, dan is alles in orde.`);

  addParagraph(doc, `2. Check je meldingen/notificaties. Lees eventuele berichten. Is er iets urgents? Meestal niet.`);

  addParagraph(doc, `3. Bekijk kort je bezoekersaantal en omzet. Niet om te analyseren, maar om een gevoel te krijgen. Onthoud: trek geen conclusies op dagelijkse data.`);

  addParagraph(doc, `4. Check je e-mail voor klantberichten. Zijn er vragen of klachten die je moet beantwoorden? Reageer binnen 24 uur.`);

  addParagraph(doc, `Klaar. Dit zou maximaal 5 minuten moeten duren. Als alles groen is en er geen urgente berichten zijn, ga door met je dag.`);

  addSubtitle(doc, 'Wekelijkse check (30 minuten)');
  addParagraph(doc, `De wekelijkse check is grondiger. Dit is waar je trends bekijkt en nadenkt over verbeteringen.`);

  addParagraph(doc, `1. Bekijk je analytics over de afgelopen 7 dagen. Vergelijk met de week ervoor. Zijn bezoekers, conversie, en omzet stabiel of in beweging?`);

  addParagraph(doc, `2. Controleer je bestsellers. Zijn ze nog beschikbaar? Laden de pagina's correct? Test door zelf naar de productpagina te gaan.`);

  addParagraph(doc, `3. Bekijk je advertentieprestaties als je ads draait. Wat zijn de kosten? Zijn er resultaten? Geef ads minimaal 7 dagen voordat je oordeelt.`);

  addParagraph(doc, `4. Controleer je verzendstatussen. Zijn er openstaande orders die aandacht nodig hebben? Zijn klanten tevreden over levertijden?`);

  addParagraph(doc, `5. Lees feedback. Zijn er reviews binnengekomen? Berichten op social media? Wat zeggen klanten?`);

  addParagraph(doc, `6. Maak één notitie: wat was deze week goed, en wat kan beter? Niet meer. Eén observatie per week is genoeg om over tijd te leren.`);

  addSubtitle(doc, 'Wat je mag overslaan');
  addParagraph(doc, `Je hoeft niet: elk product individueel te controleren, elke pagina te testen, elk analytics-rapport uit te pluizen, of te optimaliseren wat al werkt. Als iets functioneert en geen klachten oplevert, laat het met rust.`);

  addParagraph(doc, `Je tijd is kostbaar. Besteed het aan dingen die impact hebben: marketing, klantenservice, en strategische verbeteringen. Niet aan obsessief controleren van systemen die prima werken.`);

  addPageNumber(doc);

  // =====================================
  // CHAPTER 15 - AFSLUITING
  // =====================================
  startNewPage(doc);
  addTitle(doc, 'Hoofdstuk 15 – Afsluiting', 18);
  addSpace(doc, 5);

  addSubtitle(doc, 'Je hebt dit');
  addParagraph(doc, `Als je deze handleiding helemaal hebt gelezen, heb je nu een solide basis om je webshop met vertrouwen te runnen. Je weet wat de cijfers betekenen en – nog belangrijker – wat ze niet betekenen. Je weet wanneer je moet ingrijpen en wanneer je moet wachten. Je weet dat niets doen soms de beste strategie is.`);

  addParagraph(doc, `Dit is geen klein ding. De meeste beginnende webshop-eigenaren worstelen maandenlang met precies deze vragen. Ze raken gestrest over lage cijfers, maken impulsieve veranderingen, en eindigen gefrustreerd. Jij hebt nu de kennis om dat te voorkomen.`);

  addSubtitle(doc, 'Vertrouwen opbouwen');
  addParagraph(doc, `Vertrouwen in je webshop groeit met ervaring. De eerste keer dat je een dag zonder orders ziet, is dat eng. De tiende keer weet je: dat is normaal, morgen is er weer een dag. De eerste keer dat een klant klaagt, schrik je. Later leer je: dit is een kans om service te tonen.`);

  addParagraph(doc, `Elk obstakel dat je overwint, bouwt vertrouwen. Elke week data die je verzamelt, geeft inzicht. Elke maand dat je webshop draait, bewijst dat het werkt. Dit is een marathon, en je bent al begonnen.`);

  addSubtitle(doc, 'Je webshop werkt');
  addParagraph(doc, `Ik wil dat je dit onthoudt: je webshop werkt. De techniek is goed. De processen zijn opgezet. Klanten kunnen vinden, browsen, kopen, en ontvangen. Alles is er.`);

  addParagraph(doc, `Wat nu komt, is groei. Dat is een geleidelijk proces van meer bezoekers krijgen, je aanbod verfijnen, en je merk bouwen. Dat gaat niet van vandaag op morgen. En dat hoeft ook niet. Je hebt een fundament – nu bouw je daarop verder, steen voor steen, dag voor dag.`);

  addSubtitle(doc, 'Je mag ademhalen');
  addParagraph(doc, `Tot slot, het belangrijkste bericht van deze hele handleiding: je mag ademhalen. Je mag je ontspannen. Je mag je laptop dichtklappen en iets anders doen. Je webshop draait op de achtergrond, 24 uur per dag, 7 dagen per week, zonder dat jij constant hoeft te kijken.`);

  addParagraph(doc, `Stilte is geen probleem. Lage cijfers zijn geen crisis. Een dag zonder orders is geen ramp. Dit zijn normale onderdelen van het runnen van een online business. Behandel ze als zodanig.`);

  addParagraph(doc, `Je hebt gekozen voor ondernemerschap, en dat vraagt moed. Maar ondernemerschap betekent niet constant in spanning leven. Het betekent slimme systemen bouwen en ze laten werken. Dat heb je gedaan. Nu mag je ervan genieten.`);

  addSpace(doc, 20);
  addParagraph(doc, `Met vertrouwen en rust,`);
  addParagraph(doc, `Het GetPawsy Team`);

  addSpace(doc, 30);
  doc.setFontSize(9);
  doc.setTextColor(128, 128, 128);
  doc.setFont('helvetica', 'italic');
  const disclaimer = `Deze handleiding is bedoeld als algemene richtlijn voor het beheren van je webshop. Specifieke situaties kunnen afwijken. Bij twijfel of technische problemen, neem contact op met support.`;
  const disclaimerLines = doc.splitTextToSize(disclaimer, CONTENT_WIDTH);
  for (const line of disclaimerLines) {
    doc.text(line, MARGIN_LEFT, yPosition);
    yPosition += 5;
  }

  addPageNumber(doc);

  return doc;
};

export const downloadAdminManualPdf = () => {
  const doc = generateAdminManualPdf();
  doc.save('GetPawsy_Complete_Admin_Handleiding.pdf');
};
