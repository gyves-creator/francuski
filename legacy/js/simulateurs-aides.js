// ─── Simulateurs Aides & Social — Calcul JS pur (sans appel API) ─────────────
(function () {
  'use strict';

  function fmt(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function fmtE(n) { return fmt(n) + ' €'; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ─── 1. APL ──────────────────────────────────────────────────────────────
  function calcAPL(data, R) {
    const loyer = parseFloat(data.loyer);
    const revenus = parseFloat(data.revenus);
    const zone = parseInt(data.zone) || 2;
    const foyer = parseInt(data.foyer) || 1;
    if (!loyer || loyer <= 0 || revenus < 0) return null;

    // Loyers plafonds 2026 (paramètres CAF)
    const plafonds = {
      1: { 1: 341.89, 2: 411.67, 3: 503.29 },
      2: { 1: 285.97, 2: 343.45, 3: 413.32 },
      3: { 1: 252.65, 2: 303.90, 3: 365.68 },
      4: { 1: 283.72, 2: 343.45, 3: 413.32 },
    };
    const loyerPlafonné = Math.min(loyer, (plafonds[foyer] || plafonds[1])[zone] || 350);

    // Participation personnelle minimale (Pp) = Pp de base
    const pp_base = { 1: 40.76, 2: 40.76, 3: 40.76, 4: 40.76 };
    const pp = pp_base[foyer] || 40.76;

    // Participation en fonction des ressources
    const tauxPP = 0.30;
    const seuilRevenu = 1200;
    const participationRevenu = Math.max(0, round2((revenus - seuilRevenu) * tauxPP / 12));

    // APL = Loyer plafonné - PP de base - participation revenus
    const apl = Math.max(0, round2(loyerPlafonné - pp - participationRevenu));
    const aplFinal = apl < 10 ? 0 : apl; // montant minimum versé = 10€

    const effortLogement = apl > 0 ? round2((loyer - aplFinal) / Math.max(revenus, 1) * 100) : round2(loyer / Math.max(revenus, 1) * 100);

    return {
      resultat: aplFinal > 0 ? fmtE(aplFinal) + ' / mois' : 'Non éligible (revenus trop élevés)',
      explication: `Estimation APL : ${fmtE(aplFinal)}/mois pour un loyer de ${fmtE(loyer)} (zone ${zone}, foyer ${foyer} personne${foyer > 1 ? 's' : ''}). Votre taux d'effort logement après APL : ${effortLogement}%. ⚠️ Cette estimation est approximative — le calcul officiel CAF est complexe et personnalisé.`,
      details: [
        `Loyer mensuel : ${fmtE(loyer)}`,
        `Loyer retenu (plafonné) : ${fmtE(loyerPlafonné)}`,
        `Zone géographique : ${zone}`,
        `Composition du foyer : ${foyer} personne(s)`,
        `Revenus mensuels : ${fmtE(revenus)}`,
        `Participation personnelle de base : ${fmtE(pp)}`,
        `Participation liée aux ressources : ${fmtE(participationRevenu)}`,
        `APL estimée : ${fmtE(aplFinal)}/mois`,
        `Reste à charge loyer : ${fmtE(round2(loyer - aplFinal))}/mois`,
        '⚠️ Simulez officiellement sur caf.fr pour un calcul exact.',
      ]
    };
  }

  // ─── 2. RSA ───────────────────────────────────────────────────────────────
  function calcRSA(data, R) {
    const revenus = parseFloat(data.revenus) || 0;
    const foyer = parseInt(data.foyer) || 1;
    if (revenus < 0) return null;

    // RSA socle forfaitaire 2026 par composition
    const forfaits = {
      1: R.rsa_montant_base,          // 635,71€
      2: round2(R.rsa_montant_base * 1.5),  // couple sans enfant
      3: round2(R.rsa_montant_base * 1.5 + R.rsa_montant_base * 0.3), // 1 enfant seul
      4: round2(R.rsa_montant_base * 1.5 + R.rsa_montant_base * 0.4), // 2 enfants seuls
      5: round2(R.rsa_montant_base * 1.5 + R.rsa_montant_base * 0.3 + R.rsa_montant_base * 0.3),
    };
    const rsaSocle = forfaits[foyer] || R.rsa_montant_base;

    // RSA = max(0, RSA socle - 0,62 × revenus)
    const rsa = Math.max(0, round2(rsaSocle - 0.62 * revenus));
    const rsaFinal = rsa < 1 ? 0 : rsa;

    return {
      resultat: rsaFinal > 0 ? fmtE(rsaFinal) + ' / mois' : 'Non éligible (revenus suffisants)',
      explication: `Avec ${fmtE(revenus)}/mois de revenus pour un foyer de ${foyer} personne(s), votre RSA estimé est de ${fmtE(rsaFinal)}/mois. Le RSA est calculé : socle (${fmtE(rsaSocle)}) - 62% des revenus.`,
      details: [
        `Revenus mensuels du foyer : ${fmtE(revenus)}`,
        `Composition : ${foyer} personne(s)`,
        `RSA socle forfaitaire : ${fmtE(rsaSocle)}`,
        `Déduction (62% des revenus) : -${fmtE(round2(revenus * 0.62))}`,
        `RSA estimé : ${fmtE(rsaFinal)}/mois`,
        rsaFinal > 0 ? `Ressources totales après RSA : ${fmtE(round2(revenus + rsaFinal))}/mois` : 'Vos ressources dépassent le plafond RSA.',
        'Le RSA est versé par la CAF. Demandez-le sur caf.fr ou via votre département.',
      ]
    };
  }

  // ─── 3. Prime d'activité ──────────────────────────────────────────────────
  function calcPrimeActivite(data, R) {
    const salaireNet = parseFloat(data.salaire_net);
    const autresRevenus = parseFloat(data.autres_revenus) || 0;
    const foyer = parseInt(data.foyer) || 1;
    if (!salaireNet || salaireNet <= 0) return null;

    const revenusTotaux = round2(salaireNet + autresRevenus);

    // Montant forfaitaire (proche du RSA)
    const forfait = R.prime_activite_base; // 599,21€ pour personne seule

    // Bonification individuelle
    const smic_net = R.smic_net; // 1 426,30€
    let bonification = 0;
    if (salaireNet >= smic_net * 0.5) {
      bonification = round2(Math.min(salaireNet / smic_net, 1) * 167.44);
    }

    // Prime = forfait + bonification - 0,61 × (salaire + autres revenus)
    const prime = Math.max(0, round2(forfait + bonification - 0.61 * revenusTotaux));

    return {
      resultat: prime > 0 ? fmtE(prime) + ' / mois' : 'Non éligible (revenus trop élevés)',
      explication: `Avec ${fmtE(salaireNet)}/mois net, votre prime d'activité est estimée à ${fmtE(prime)}/mois. Elle est versée trimestriellement par la CAF et vise à compléter les revenus d'activité.`,
      details: [
        `Salaire net mensuel : ${fmtE(salaireNet)}`,
        autresRevenus > 0 ? `Autres revenus : ${fmtE(autresRevenus)}` : null,
        `Revenus totaux : ${fmtE(revenusTotaux)}`,
        `Montant forfaitaire : ${fmtE(forfait)}`,
        `Bonification individuelle : +${fmtE(bonification)}`,
        `Déduction (61% des revenus) : -${fmtE(round2(revenusTotaux * 0.61))}`,
        `Prime d'activité estimée : ${fmtE(prime)}/mois`,
        'Versée trimestriellement. Simuler sur caf.fr pour confirmation.',
      ].filter(Boolean)
    };
  }

  // ─── 4. Allocation chômage (ARE) ─────────────────────────────────────────
  function calcAllocationChomage(data, R) {
    const salaireBrut = parseFloat(data.salaire_brut);
    const dureeTravail = parseInt(data.duree_travail) || 24;
    if (!salaireBrut || salaireBrut <= 0) return null;

    // SJR (Salaire Journalier de Référence)
    const salaireRefAnnuel = round2(salaireBrut * Math.min(dureeTravail, 24));
    const nbJoursRef = Math.min(dureeTravail, 24) * 30;
    const sjr = round2(salaireRefAnnuel / nbJoursRef);

    // ARE = 57% du SJR (minimum : 31,59€/j, maximum : 75% du SJR)
    const areJournalier = Math.max(
      R.allocation_chomage_min_journalier,
      Math.min(round2(sjr * R.allocation_chomage_taux), round2(sjr * 0.75))
    );
    const areMensuel = round2(areJournalier * 30);

    // Durée maximale d'indemnisation
    const dureeMaxMois = dureeTravail <= 6 ? 6 : dureeTravail <= 12 ? 12 : dureeTravail <= 24 ? 18 : 24;

    // Cotisation retraite maintenue (sur base ARE)
    const cotRetraite = round2(areMensuel * 0.028);

    return {
      resultat: fmtE(areMensuel) + ' / mois',
      explication: `Avec un salaire brut de ${fmtE(salaireBrut)}/mois, votre ARE (allocation chômage) est estimée à ${fmtE(areJournalier)}/jour, soit ${fmtE(areMensuel)}/mois pendant ${dureeMaxMois} mois maximum.`,
      details: [
        `Salaire brut mensuel de référence : ${fmtE(salaireBrut)}`,
        `Durée de travail retenue : ${Math.min(dureeTravail, 24)} mois`,
        `Salaire Journalier de Référence (SJR) : ${fmtE(sjr)}/jour`,
        `ARE journalière (57% du SJR) : ${fmtE(areJournalier)}/jour`,
        `ARE mensuelle (× 30 jours) : ${fmtE(areMensuel)}`,
        `Durée maximale d'indemnisation : ${dureeMaxMois} mois`,
        `Montant total potentiel : ${fmtE(round2(areMensuel * dureeMaxMois))}`,
        `Plancher légal : ${fmtE(R.allocation_chomage_min_journalier)}/jour`,
        'La dégressivité s\'applique à partir de 8 mois pour les salaires > 4 500€/mois brut.',
      ]
    };
  }

  // ─── 5. Allocations familiales ───────────────────────────────────────────
  function calcAllocationsFamiliales(data, R) {
    const nbEnfants = parseInt(data.nb_enfants) || 0;
    const revenusFoyer = parseFloat(data.revenus_foyer) || 0;
    if (nbEnfants < 2) {
      return {
        resultat: '0 € (moins de 2 enfants)',
        explication: 'Les allocations familiales sont versées à partir de 2 enfants à charge de moins de 20 ans.',
        details: ['Condition : au moins 2 enfants à charge de moins de 20 ans.']
      };
    }

    // Montants de base 2026
    const baseAF = nbEnfants === 2
      ? R.af_base_2_enfants
      : round2(R.af_base_2_enfants + (nbEnfants - 2) * R.af_base_par_enfant_supp);

    // Modulation selon revenus (plafonds 2026)
    // Plafond de base : 73 334€ (1 enfant) + 5 948€ par enfant supp
    const plafondBase = 73334 + (nbEnfants - 1) * 5948;
    const plafond2 = plafondBase + 36667;

    let modulation = 1.0;
    if (revenusFoyer > plafond2) modulation = 0.25;
    else if (revenusFoyer > plafondBase) modulation = 0.50;

    const af = round2(baseAF * modulation);

    return {
      resultat: fmtE(af) + ' / mois',
      explication: `Pour ${nbEnfants} enfant(s), les allocations familiales sont de ${fmtE(af)}/mois${modulation < 1 ? ` (modulées à ${modulation * 100}% selon vos revenus)` : ''}.`,
      details: [
        `Nombre d'enfants : ${nbEnfants}`,
        `Allocations de base : ${fmtE(baseAF)}/mois`,
        revenusFoyer > 0 ? `Revenus du foyer : ${fmtE(revenusFoyer)}/an` : null,
        revenusFoyer > 0 ? `Plafond taux plein : ${fmtE(plafondBase)}/an` : null,
        modulation < 1 ? `Modulation appliquée : ${modulation * 100}%` : 'Taux plein applicable',
        `Allocations modulées : ${fmtE(af)}/mois`,
        'Versées le 5 de chaque mois par la CAF jusqu\'aux 20 ans de l\'enfant.',
      ].filter(Boolean)
    };
  }

  // ─── 6. Indemnités journalières maladie ─────────────────────────────────
  function calcIJMaladie(data, R) {
    const salaireBrut = parseFloat(data.salaire_brut);
    const dureeArret = parseInt(data.duree_arret) || 30;
    const longue = data.longue_maladie === 'oui';
    if (!salaireBrut || salaireBrut <= 0) return null;

    // Base de calcul : 1/91,25 × total brut 3 derniers mois (= salaire mensuel / 30,42 × 3)
    // Plafond : 1/730 × 1,8 × PASS annuel
    const pass = R.pass_annuel;
    const plafondIJ = round2(1.8 * pass / 365);

    const salaireBrutJournalier = round2(salaireBrut / 30.42);
    const baseCalcul = Math.min(salaireBrutJournalier, plafondIJ);

    // Taux : 50% les 6 premiers mois (180 jours), 66,67% au-delà (longue maladie ou ALD)
    const taux = longue || dureeArret > 180 ? R.ij_maladie_taux_longue_maladie : R.ij_maladie_taux;
    const ij = round2(baseCalcul * taux);

    // Délai de carence : 3 jours (1er jour : 0€)
    const joursEffectifs = Math.max(0, dureeArret - 3);
    const totalIJ = round2(ij * joursEffectifs);
    const ijMensuelle = round2(ij * 30);

    // Maintien de salaire par l'employeur (au-delà du délai de carence, selon ancienneté)
    const maintienEstime = round2(salaireBrut - ijMensuelle);

    return {
      resultat: fmtE(ij) + ' / jour',
      explication: `Votre IJ maladie est de ${fmtE(ij)}/jour (${(taux * 100).toFixed(2)}% du salaire journalier plafonné). Pour ${dureeArret} jours d'arrêt (carence 3 jours), vous percevrez ${fmtE(totalIJ)} de la Sécurité Sociale. ${maintienEstime > 0 ? `Votre employeur complète sous conditions.` : ''}`,
      details: [
        `Salaire brut mensuel : ${fmtE(salaireBrut)}`,
        `Salaire journalier (÷30,42) : ${fmtE(salaireBrutJournalier)}`,
        `Plafond IJ (1,8 × PASS ÷ 365) : ${fmtE(plafondIJ)}`,
        `Base retenue : ${fmtE(baseCalcul)}/jour`,
        `Taux : ${(taux * 100).toFixed(2)}% ${longue ? '(longue maladie / ALD)' : '(maladie ordinaire)'}`,
        `IJ brute : ${fmtE(ij)}/jour`,
        `Délai de carence : 3 jours`,
        `Jours indemnisés : ${joursEffectifs} jours`,
        `Total IJ CPAM : ${fmtE(totalIJ)}`,
        `IJ mensuelle estimée : ${fmtE(ijMensuelle)}`,
        'L\'employeur maintient le salaire sous conditions d\'ancienneté (convention collective).',
      ]
    };
  }

  // ─── 7. Bourse étudiante ──────────────────────────────────────────────────
  function calcBourseEtudiante(data, R) {
    const revenus = parseFloat(data.revenus_parents);
    const nbEnfantsCharge = parseInt(data.nb_enfants_charge) || 1;
    const distanceDomicile = parseInt(data.distance) || 30;
    if (!revenus || revenus < 0) return null;

    // Barème simplifié CROUS 2026 (points de charge → échelon)
    // Points de charge : distance, enfants à charge, parents séparés, etc.
    let pointsCharge = 0;
    if (distanceDomicile > 30) pointsCharge += 1;
    if (distanceDomicile > 250) pointsCharge += 1;
    if (nbEnfantsCharge >= 2) pointsCharge += 1;
    if (nbEnfantsCharge >= 3) pointsCharge += 1;

    // Plafonds revenus 2026 (revenus fiscaux N-2) par échelon et points de charge
    // Seuils indicatifs (simplifiés)
    const seuilEchelon = [
      { echelon: 0, seuil: 33100 },
      { echelon: 1, seuil: 27900 },
      { echelon: 2, seuil: 23800 },
      { echelon: 3, seuil: 20100 },
      { echelon: 4, seuil: 16500 },
      { echelon: 5, seuil: 13200 },
      { echelon: 6, seuil: 9700 },
      { echelon: 7, seuil: 6600 },
    ];

    const seuilAjuste = seuilEchelon.map(e => ({ ...e, seuil: round2(e.seuil * (1 + pointsCharge * 0.10)) }));

    let echelon = -1;
    for (const e of seuilAjuste) {
      if (revenus <= e.seuil) { echelon = e.echelon; break; }
    }

    const montants = {
      0: 0, 1: R.bourse_echelon_1, 2: R.bourse_echelon_2, 3: R.bourse_echelon_3,
      4: R.bourse_echelon_4, 5: R.bourse_echelon_5, 6: R.bourse_echelon_6, 7: R.bourse_echelon_7
    };
    const bourse = echelon >= 0 ? (montants[echelon] || 0) : 0;
    const bourseParMois = echelon >= 1 ? round2(bourse / 10) : 0; // versée sur 10 mois

    return {
      resultat: echelon >= 1 ? `Échelon ${echelon} — ${fmtE(bourseParMois)}/mois` : 'Non éligible (revenus trop élevés)',
      explication: `Avec ${fmtE(revenus)} de revenus parentaux et ${pointsCharge} point(s) de charge, vous seriez à l'échelon ${echelon >= 0 ? echelon : 'hors barème'}. La bourse annuelle est de ${fmtE(bourse)} (${fmtE(bourseParMois)}/mois sur 10 mois). ⚠️ Simulation approximative — déposez votre dossier sur messervices.etudiant.gouv.fr.`,
      details: [
        `Revenus fiscaux parents N-2 : ${fmtE(revenus)}`,
        `Enfants à charge : ${nbEnfantsCharge}`,
        `Distance domicile / lieu d'études : ${distanceDomicile} km`,
        `Points de charge estimés : ${pointsCharge}`,
        `Échelon estimé : ${echelon >= 0 ? echelon : 'Non éligible'}`,
        `Bourse annuelle : ${fmtE(bourse)}`,
        `Bourse mensuelle (10 mois) : ${fmtE(bourseParMois)}`,
        'Déposez le dossier social étudiant (DSE) entre janvier et mai sur messervices.etudiant.gouv.fr.',
      ]
    };
  }

  // ─── 8. Pension alimentaire ───────────────────────────────────────────────
  function calcPensionAlimentaire(data, R) {
    const revenuDebiteur = parseFloat(data.revenu_debiteur);
    const nbEnfants = parseInt(data.nb_enfants) || 1;
    const gardeAlternee = data.garde === 'alternee';
    if (!revenuDebiteur || revenuDebiteur <= 0 || nbEnfants <= 0) return null;

    // Barème indicatif de la Chancellerie (table de référence)
    // % du revenu net débiteur selon nb d'enfants et mode de garde
    const tauxBase = {
      1: gardeAlternee ? 0.045 : 0.093,
      2: gardeAlternee ? 0.072 : 0.148,
      3: gardeAlternee ? 0.093 : 0.189,
      4: gardeAlternee ? 0.107 : 0.220,
    };
    const taux = tauxBase[Math.min(nbEnfants, 4)] || (gardeAlternee ? 0.107 + (nbEnfants - 4) * 0.015 : 0.220 + (nbEnfants - 4) * 0.025);

    const pension = round2(revenuDebiteur * taux);
    const pensionParEnfant = round2(pension / nbEnfants);

    return {
      resultat: fmtE(pension) + ' / mois',
      explication: `D'après la table de référence de la Chancellerie, avec ${fmtE(revenuDebiteur)}/mois net et ${nbEnfants} enfant(s) en garde ${gardeAlternee ? 'alternée' : 'exclusive'}, la pension alimentaire est estimée à ${fmtE(pension)}/mois (${fmtE(pensionParEnfant)}/enfant).`,
      details: [
        `Revenu net mensuel du débiteur : ${fmtE(revenuDebiteur)}`,
        `Nombre d'enfants : ${nbEnfants}`,
        `Mode de garde : ${gardeAlternee ? 'alternée (50/50)' : 'exclusive (chez le créancier)'}`,
        `Taux appliqué (table Chancellerie) : ${(taux * 100).toFixed(1)}%`,
        `Pension totale estimée : ${fmtE(pension)}/mois`,
        `Pension par enfant : ${fmtE(pensionParEnfant)}/mois`,
        '⚠️ Le juge dispose d\'un large pouvoir d\'appréciation. Cette estimation est indicative.',
        'Outil officiel : justice.fr/simulateur-pension-alimentaire',
      ]
    };
  }

  // ─── Registre ────────────────────────────────────────────────────────────
  if (!window.CALCULATEURS_JS) window.CALCULATEURS_JS = {};
  Object.assign(window.CALCULATEURS_JS, {
    'simulateur-apl':                          function(d) { return calcAPL(d, window.RATES); },
    'simulateur-rsa':                          function(d) { return calcRSA(d, window.RATES); },
    'simulateur-prime-activite':               function(d) { return calcPrimeActivite(d, window.RATES); },
    'calcul-allocation-chomage':               function(d) { return calcAllocationChomage(d, window.RATES); },
    'simulateur-allocations-familiales':       function(d) { return calcAllocationsFamiliales(d, window.RATES); },
    'calcul-indemnites-journalieres-maladie':  function(d) { return calcIJMaladie(d, window.RATES); },
    'simulateur-bourse-etudiante':             function(d) { return calcBourseEtudiante(d, window.RATES); },
    'calcul-pension-alimentaire':              function(d) { return calcPensionAlimentaire(d, window.RATES); },
  });

})();
