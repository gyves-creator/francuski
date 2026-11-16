// ─── Simulateurs Salaire & Travail — Calcul JS pur (sans appel API) ──────────
// Les taux sont injectés par le serveur dans window.RATES

(function () {
  'use strict';

  // ─── Utilitaires ─────────────────────────────────────────────────────────
  function fmt(n) {
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function fmtE(n) { return fmt(n) + ' €'; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ─── 1. Simulateur Brut → Net ─────────────────────────────────────────────
  function calcBrutNet(data, R) {
    const brut = parseFloat(data.brut);
    if (!brut || brut <= 0) return null;

    const cotisations = round2(brut * R.cotisations_salariales);
    const net = round2(brut - cotisations);
    const netAnnuel = round2(net * 12);
    const brutAnnuel = round2(brut * 12);
    const txHoraire = round2(net / 151.67);
    const isAlternance = (data.contrat === 'alternance');

    let explication = `Votre salaire net estimé est de ${fmtE(net)} par mois, après déduction de ${fmtE(cotisations)} de cotisations salariales (taux ${(R.cotisations_salariales * 100).toFixed(2)}% en 2026).`;
    if (isAlternance) explication += ' Note : le salaire en alternance peut bénéficier d\'exonérations spécifiques selon le barème SMIC.';
    if (brut < R.smic_brut) explication += ` ⚠️ Ce salaire est inférieur au SMIC brut de ${fmtE(R.smic_brut)}.`;

    return {
      resultat: fmtE(net) + ' net / mois',
      explication,
      details: [
        `Salaire brut : ${fmtE(brut)}`,
        `Cotisations salariales (${(R.cotisations_salariales * 100).toFixed(2)}%) : -${fmtE(cotisations)}`,
        `Net annuel : ${fmtE(netAnnuel)}`,
        `Brut annuel : ${fmtE(brutAnnuel)}`,
        `Taux horaire net (base 151,67h) : ${fmtE(txHoraire)}/h`,
      ]
    };
  }

  // ─── 2. Simulateur Net → Brut ─────────────────────────────────────────────
  function calcNetBrut(data, R) {
    const net = parseFloat(data.net);
    if (!net || net <= 0) return null;

    const coeff = 1 - R.cotisations_salariales;
    const brut = round2(net / coeff);
    const cotisations = round2(brut - net);
    const brutAnnuel = round2(brut * 12);
    const coutPatronal = round2(brut * (1 + R.cotisations_patronales));

    return {
      resultat: fmtE(brut) + ' brut / mois',
      explication: `Pour percevoir ${fmtE(net)} net par mois, votre salaire brut doit être de ${fmtE(brut)} (cotisations salariales : ${(R.cotisations_salariales * 100).toFixed(2)}% en 2026).`,
      details: [
        `Salaire brut : ${fmtE(brut)}`,
        `Cotisations salariales : ${fmtE(cotisations)}`,
        `Brut annuel : ${fmtE(brutAnnuel)}`,
        `Coût total employeur estimé : ${fmtE(coutPatronal)}/mois (charges patronales ~${(R.cotisations_patronales * 100).toFixed(0)}%)`,
      ]
    };
  }

  // ─── 3. Heures supplémentaires ────────────────────────────────────────────
  function calcHeuresSup(data, R) {
    const brut = parseFloat(data.salaire_brut);
    const h25 = parseFloat(data.heures_25) || 0;
    const h50 = parseFloat(data.heures_50) || 0;
    if (!brut || brut <= 0) return null;
    if (h25 < 0 || h50 < 0) return null;

    const txH = round2(brut / 151.67);
    // 4.333 semaines/mois en moyenne
    const brut25 = round2(h25 * 4.333 * txH * (1 + R.taux_heures_sup_1));
    const brut50 = round2(h50 * 4.333 * txH * (1 + R.taux_heures_sup_2));
    const totalBrutSup = round2(brut25 + brut50);
    // Heures sup : exonération IR dans la limite de 7 500 €/an (loi 2019)
    // Cotisations salariales restent dues (taux normal)
    const netSup = round2(totalBrutSup * (1 - R.cotisations_salariales));
    const netTotal = round2((brut + totalBrutSup) * (1 - R.cotisations_salariales));
    const exoIRMensuelle = round2(Math.min(totalBrutSup, 7500 / 12));

    return {
      resultat: '+' + fmtE(netSup) + ' net / mois',
      explication: `Vos heures supplémentaires représentent ${fmtE(totalBrutSup)} brut/mois, soit ${fmtE(netSup)} net après cotisations. Elles sont exonérées d'impôt sur le revenu dans la limite de 7 500 €/an (${fmtE(exoIRMensuelle)}/mois).`,
      details: [
        `Taux horaire brut : ${fmtE(txH)}/h`,
        `Heures sup +25% (${h25}h/sem) : +${fmtE(brut25)} brut/mois`,
        `Heures sup +50% (${h50}h/sem) : +${fmtE(brut50)} brut/mois`,
        `Supplément brut total : ${fmtE(totalBrutSup)}/mois`,
        `Supplément net total : ${fmtE(netSup)}/mois`,
        `Salaire net total estimé : ${fmtE(netTotal)}/mois`,
        `Exonération IR mensuelle : ~${fmtE(exoIRMensuelle)} (plafond 7 500 €/an)`,
      ]
    };
  }

  // ─── 4. Indemnités de licenciement ────────────────────────────────────────
  function calcLicenciement(data, R) {
    const brut = parseFloat(data.salaire_brut);
    const anciennete = parseFloat(data.anciennete);
    if (!brut || brut <= 0 || !anciennete || anciennete < 0) return null;

    if (anciennete < 1) {
      return {
        resultat: '0 €',
        explication: 'L\'indemnité légale de licenciement nécessite au moins 8 mois d\'ancienneté (soit ~0,67 an). Avec moins d\'un an d\'ancienneté, aucune indemnité légale n\'est due.',
        details: ['Ancienneté requise : minimum 8 mois (0,67 an)']
      };
    }

    // Formule légale : 1/4 de mois par année jusqu'à 10 ans, 1/3 au-delà
    const tranche1 = Math.min(anciennete, R.indemnite_licenciement_seuil);
    const tranche2 = Math.max(0, anciennete - R.indemnite_licenciement_seuil);
    const indemnite = round2(brut * (R.indemnite_licenciement_tranche1 * tranche1 + R.indemnite_licenciement_tranche2 * tranche2));

    // Exonération d'IR : indemnité légale totalement exonérée si ≤ 2× PASS annuel
    const plafondExo = R.pass_annuel * 2;
    const exonere = indemnite <= plafondExo;

    return {
      resultat: fmtE(indemnite),
      explication: `Avec ${anciennete} an(s) d'ancienneté et un salaire brut de ${fmtE(brut)}/mois, votre indemnité légale de licenciement est estimée à ${fmtE(indemnite)}. ${exonere ? 'Elle est exonérée d\'impôt sur le revenu (inférieure à 2 PASS).' : 'Elle peut être partiellement imposable (supérieure à 2 PASS).'}`,
      details: [
        `Tranche 1 (≤10 ans) : ${tranche1} an(s) × ¼ de mois = ${fmtE(round2(brut * R.indemnite_licenciement_tranche1 * tranche1))}`,
        tranche2 > 0 ? `Tranche 2 (>10 ans) : ${tranche2} an(s) × ⅓ de mois = ${fmtE(round2(brut * R.indemnite_licenciement_tranche2 * tranche2))}` : null,
        `Indemnité totale : ${fmtE(indemnite)}`,
        `Exonération IR : ${exonere ? 'Oui (≤ 2 PASS = ' + fmtE(plafondExo) + ')' : 'Partielle (> 2 PASS)'}`,
        'Note : votre convention collective peut prévoir un montant plus favorable.',
      ].filter(Boolean)
    };
  }

  // ─── 5. Rupture conventionnelle ───────────────────────────────────────────
  function calcRuptureConventionnelle(data, R) {
    const brut = parseFloat(data.salaire_brut);
    const anciennete = parseFloat(data.anciennete);
    if (!brut || brut <= 0 || !anciennete || anciennete < 0) return null;

    if (anciennete < 1) {
      // Calcul au prorata pour < 1 an (mois complets)
      const mois = Math.round(anciennete * 12);
      const indemnite = round2(brut * R.rupture_conventionnelle_min * (mois / 12));
      return {
        resultat: fmtE(indemnite),
        explication: `Pour ${mois} mois d'ancienneté, l'indemnité minimale de rupture conventionnelle est de ${fmtE(indemnite)}.`,
        details: [`Calcul : ${fmtE(brut)} × ${(R.rupture_conventionnelle_min * 100).toFixed(0)}% × (${mois}/12)`]
      };
    }

    // Même barème que licenciement (minimum légal)
    const tranche1 = Math.min(anciennete, R.indemnite_licenciement_seuil);
    const tranche2 = Math.max(0, anciennete - R.indemnite_licenciement_seuil);
    const indemnite = round2(brut * (R.rupture_conventionnelle_min * tranche1 + R.indemnite_licenciement_tranche2 * tranche2));

    // Exonération : plafond = 2 PASS ou indemnité légale licenciement si > 2 PASS
    const plafondExo = Math.max(R.pass_annuel * 2, indemnite);
    const csgRds = indemnite > R.pass_annuel * 2 ? round2((indemnite - R.pass_annuel * 2) * 0.097) : 0;

    return {
      resultat: fmtE(indemnite),
      explication: `L'indemnité minimale légale de rupture conventionnelle est de ${fmtE(indemnite)} pour ${anciennete} an(s) d'ancienneté. Ce montant peut être négocié à la hausse avec votre employeur.`,
      details: [
        `Tranche ≤10 ans : ${tranche1} an(s) × ¼ mois = ${fmtE(round2(brut * R.rupture_conventionnelle_min * tranche1))}`,
        tranche2 > 0 ? `Tranche >10 ans : ${tranche2} an(s) × ⅓ mois = ${fmtE(round2(brut * R.indemnite_licenciement_tranche2 * tranche2))}` : null,
        `Indemnité minimale : ${fmtE(indemnite)}`,
        csgRds > 0 ? `CSG/CRDS estimée (part > 2 PASS) : ${fmtE(csgRds)}` : 'Exonération IR et CSG/CRDS si ≤ 2 PASS',
        'La convention collective peut prévoir un montant plus élevé.',
      ].filter(Boolean)
    };
  }

  // ─── 6. Prime de précarité CDD ────────────────────────────────────────────
  function calcPrimePrecarite(data, R) {
    const brut = parseFloat(data.salaire_brut);
    const duree = parseFloat(data.duree_mois);
    if (!brut || brut <= 0 || !duree || duree <= 0) return null;

    const totalBrut = round2(brut * duree);
    const prime = round2(totalBrut * R.prime_precarite_cdd);
    const primeNette = round2(prime * (1 - R.cotisations_salariales));

    return {
      resultat: fmtE(prime) + ' brut',
      explication: `La prime de précarité (fin de CDD) est de 10% du total des salaires bruts perçus, soit ${fmtE(prime)} brut (${fmtE(primeNette)} net estimé). Elle est versée à la fin du contrat si celui-ci n'est pas suivi d'un CDI dans la même entreprise.`,
      details: [
        `Salaire brut mensuel : ${fmtE(brut)}`,
        `Durée du CDD : ${duree} mois`,
        `Total brut perçu : ${fmtE(totalBrut)}`,
        `Prime de précarité (10%) : ${fmtE(prime)} brut`,
        `Estimation nette : ${fmtE(primeNette)}`,
        'Non due si : embauche en CDI, refus de CDI équivalent, contrat saisonnier ou d\'usage.',
      ]
    };
  }

  // ─── 7. Congés payés ─────────────────────────────────────────────────────
  function calcCongesPayes(data, R) {
    const brut = parseFloat(data.salaire_brut);
    const nbJours = parseFloat(data.nb_jours);
    if (!brut || brut <= 0 || !nbJours || nbJours <= 0) return null;

    // Méthode 1/10 : 1/10 des salaires bruts de la période de référence
    // Pour un mois de congés (30j ouvrables = 2,5j/mois × 12 = 30j), l'indemnité annuelle = salaire × 1/10
    const indemniteJournaliere_1_10 = round2((brut * 12 * R.conges_payes_taux) / 30);

    // Méthode maintien de salaire : salaire_quotidien × nb_jours
    // Salaire journalier = brut / 21.67 (jours ouvrés moyens par mois)
    const salaireJournalier = round2(brut / 21.67);

    // On applique la méthode la plus favorable (loi)
    const methodeFavorable = indemniteJournaliere_1_10 >= salaireJournalier ? '1/10' : 'maintien';
    const indemnitePJ = Math.max(indemniteJournaliere_1_10, salaireJournalier);
    const indemniteTotale = round2(indemnitePJ * nbJours);
    const indemniteTotaleNet = round2(indemniteTotale * (1 - R.cotisations_salariales));

    return {
      resultat: fmtE(indemniteTotale) + ' brut',
      explication: `Pour ${nbJours} jour(s) de congés, votre indemnité est de ${fmtE(indemniteTotale)} brut (${fmtE(indemniteTotaleNet)} net estimé), calculée selon la méthode du ${methodeFavorable === '1/10' ? '1/10 des salaires' : 'maintien de salaire'} (la plus favorable).`,
      details: [
        `Méthode 1/10 : ${fmtE(indemniteJournaliere_1_10)}/jour ouvrable`,
        `Méthode maintien salaire : ${fmtE(salaireJournalier)}/jour ouvré`,
        `Méthode retenue : ${methodeFavorable === '1/10' ? '1/10 des salaires' : 'maintien de salaire'} (plus favorable)`,
        `Indemnité totale brute : ${fmtE(indemniteTotale)}`,
        `Indemnité totale nette estimée : ${fmtE(indemniteTotaleNet)}`,
        'Droit annuel légal : 2,5 jours ouvrables par mois travaillé (30 jours max).',
      ]
    };
  }

  // ─── 8. Ticket restaurant ─────────────────────────────────────────────────
  function calcTicketRestaurant(data, R) {
    const valeur = parseFloat(data.valeur_ticket);
    const pctEmp = parseFloat(data.part_employeur_pct) || 60;
    const nbJours = parseFloat(data.nb_jours) || 21;
    if (!valeur || valeur <= 0) return null;

    if (pctEmp < 50 || pctEmp > 60) {
      return {
        resultat: 'Paramètre invalide',
        explication: 'La part employeur doit être comprise entre 50% et 60% de la valeur faciale (règle légale 2026).',
        details: []
      };
    }

    const partEmployeur = round2(valeur * pctEmp / 100);
    const partSalarie = round2(valeur - partEmployeur);
    const exonerationParTitre = Math.min(partEmployeur, R.ticket_restaurant_exoneration_max);
    const avantageNetMensuel = round2(partEmployeur * nbJours);
    const coutSalarieMensuel = round2(partSalarie * nbJours);
    const exonerationMensuelle = round2(exonerationParTitre * nbJours);
    const imposable = round2(Math.max(0, partEmployeur - R.ticket_restaurant_exoneration_max) * nbJours);

    return {
      resultat: fmtE(avantageNetMensuel) + ' / mois',
      explication: `Avec un ticket de ${fmtE(valeur)} à ${pctEmp}% pris en charge par l'employeur, vous bénéficiez de ${fmtE(avantageNetMensuel)}/mois d'avantage (${nbJours} jours). La part exonérée de cotisations est de ${fmtE(exonerationMensuelle)}/mois (plafond ${fmtE(R.ticket_restaurant_exoneration_max)}/titre).`,
      details: [
        `Valeur faciale : ${fmtE(valeur)}/titre`,
        `Part employeur (${pctEmp}%) : ${fmtE(partEmployeur)}/titre`,
        `Part salarié (${100 - pctEmp}%) : ${fmtE(partSalarie)}/titre`,
        `Exonération cotisations : ${fmtE(exonerationParTitre)}/titre (plafond ${fmtE(R.ticket_restaurant_exoneration_max)})`,
        `Avantage mensuel employé : ${fmtE(avantageNetMensuel)} (${nbJours} jours)`,
        `Coût mensuel salarié : ${fmtE(coutSalarieMensuel)}`,
        imposable > 0 ? `Part imposable estimée : ${fmtE(imposable)}/mois (dépasse le plafond)` : 'Part entièrement exonérée de cotisations.',
      ]
    };
  }

  // ─── 9. Budget mensuel ────────────────────────────────────────────────────
  function calcBudget(data) {
    const revenu = parseFloat(data.revenu_net) || 0;
    const loyer = parseFloat(data.loyer) || 0;
    const alim = parseFloat(data.alimentation) || 0;
    const transport = parseFloat(data.transport) || 0;
    const sante = parseFloat(data.sante) || 0;
    const loisirs = parseFloat(data.loisirs) || 0;
    const epargne = parseFloat(data.epargne) || 0;
    const autres = parseFloat(data.autres) || 0;

    if (revenu <= 0) return null;

    const totalDepenses = round2(loyer + alim + transport + sante + loisirs + epargne + autres);
    const resteAVivre = round2(revenu - totalDepenses);
    const tauxEpargne = revenu > 0 ? round2(epargne / revenu * 100) : 0;
    const tauxLogement = revenu > 0 ? round2(loyer / revenu * 100) : 0;

    const conseil = [];
    if (tauxLogement > 35) conseil.push(`⚠️ Votre taux d'effort logement est de ${tauxLogement}% (> 35% recommandés).`);
    if (tauxEpargne < 10 && epargne > 0) conseil.push('💡 Taux d\'épargne inférieur à 10% : essayez d\'augmenter progressivement.');
    if (tauxEpargne >= 20) conseil.push(`✅ Excellent taux d'épargne de ${tauxEpargne}% !`);
    if (resteAVivre < 0) conseil.push('⚠️ Vos dépenses dépassent vos revenus. Un rééquilibrage est nécessaire.');
    if (resteAVivre > 0 && epargne === 0) conseil.push('💡 Vous avez un solde positif : pensez à épargner régulièrement.');

    const status = resteAVivre >= 0 ? `+${fmtE(resteAVivre)} disponible` : fmtE(resteAVivre) + ' de déficit';

    return {
      resultat: status,
      explication: `Votre budget mensuel affiche ${resteAVivre >= 0 ? 'un solde positif' : 'un déficit'} de ${fmtE(Math.abs(resteAVivre))}. Total dépenses : ${fmtE(totalDepenses)} sur ${fmtE(revenu)} de revenus. ${conseil.join(' ')}`,
      details: [
        `Revenus nets : ${fmtE(revenu)}`,
        loyer > 0 ? `Logement : ${fmtE(loyer)} (${tauxLogement}% des revenus)` : null,
        alim > 0 ? `Alimentation : ${fmtE(alim)}` : null,
        transport > 0 ? `Transport : ${fmtE(transport)}` : null,
        sante > 0 ? `Santé : ${fmtE(sante)}` : null,
        loisirs > 0 ? `Loisirs : ${fmtE(loisirs)}` : null,
        epargne > 0 ? `Épargne : ${fmtE(epargne)} (${tauxEpargne}% des revenus)` : null,
        autres > 0 ? `Autres : ${fmtE(autres)}` : null,
        `Total dépenses : ${fmtE(totalDepenses)}`,
        `Reste à vivre : ${fmtE(resteAVivre)}`,
      ].filter(Boolean)
    };
  }

  // ─── 10. Niveau de richesse ───────────────────────────────────────────────
  function calcNiveauRichesse(data) {
    const revenu = parseFloat(data.revenu_net);
    const adultes = parseInt(data.adultes) || 1;
    const enfants = parseInt(data.enfants) || 0;
    if (!revenu || revenu <= 0) return null;

    // Unités de consommation (échelle OCDE modifiée)
    // 1ère personne adulte = 1 UC, adulte suivant = 0.5 UC, enfant <14 = 0.3 UC
    const uc = 1 + (adultes > 1 ? 0.5 : 0) + Math.min(enfants, 4) * 0.3;
    const revenuParUC = round2(revenu / uc);

    // Déciles INSEE revenus disponibles par UC (France 2026, net mensuel estimé)
    // Source : INSEE, données actualisées 2026
    const deciles = [
      { d: 1, seuil: 1050,  label: 'D1' },
      { d: 2, seuil: 1350,  label: 'D2' },
      { d: 3, seuil: 1600,  label: 'D3' },
      { d: 4, seuil: 1820,  label: 'D4' },
      { d: 5, seuil: 2050,  label: 'D5 (médiane)' },
      { d: 6, seuil: 2350,  label: 'D6' },
      { d: 7, seuil: 2750,  label: 'D7' },
      { d: 8, seuil: 3350,  label: 'D8' },
      { d: 9, seuil: 4600,  label: 'D9' },
    ];

    let decile = 10;
    for (const d of deciles) {
      if (revenuParUC <= d.seuil) { decile = d.d; break; }
    }
    const mediane = 2050;
    const ratioMediane = round2(revenuParUC / mediane * 100);

    // Seuil de pauvreté (60% de la médiane)
    const seuilPauvrete = round2(mediane * 0.6);
    const isPauvre = revenuParUC < seuilPauvrete;

    // Seuil de classe aisée (2× la médiane)
    const isAise = revenuParUC >= mediane * 2;
    const isRiche = revenuParUC >= deciles[8].seuil;

    let statut;
    if (isPauvre) statut = 'Sous le seuil de pauvreté';
    else if (revenuParUC < mediane * 0.8) statut = 'Classes modestes';
    else if (revenuParUC < mediane * 1.2) statut = 'Classes moyennes (proche de la médiane)';
    else if (revenuParUC < mediane * 2) statut = 'Classes moyennes supérieures';
    else if (isRiche) statut = 'Classe aisée (top 10%)';
    else statut = 'Classe aisée';

    return {
      resultat: `D${decile} — ${statut}`,
      explication: `Avec ${fmtE(revenu)}/mois pour ${adultes} adulte(s) et ${enfants} enfant(s) (${uc.toFixed(1)} UC), votre revenu par unité de consommation est de ${fmtE(revenuParUC)}/mois. Vous êtes dans le décile ${decile} des Français, à ${ratioMediane}% du revenu médian (${fmtE(mediane)}/UC/mois).`,
      details: [
        `Revenu foyer : ${fmtE(revenu)}/mois`,
        `Unités de consommation (UC) : ${uc.toFixed(2)}`,
        `Revenu par UC : ${fmtE(revenuParUC)}/mois`,
        `Revenu médian France (2026) : ${fmtE(mediane)}/UC/mois`,
        `Vous êtes à ${ratioMediane}% de la médiane`,
        `Décile de revenus : D${decile} (parmi les ${decile === 10 ? '10% les plus aisés' : decile * 10 + '% les moins aisés'})`,
        isPauvre ? `⚠️ Sous le seuil de pauvreté (${fmtE(seuilPauvrete)}/UC/mois)` : null,
        isRiche ? '🏆 Vous faites partie des 10% les plus aisés de France.' : null,
        'Source : INSEE, données revenus disponibles par UC, actualisées 2026.',
      ].filter(Boolean)
    };
  }

  // ─── Registre des calculateurs JS ────────────────────────────────────────
  window.CALCULATEURS_JS = {
    'simulateur-brut-net':            function(d) { return calcBrutNet(d, window.RATES); },
    'simulateur-net-brut':            function(d) { return calcNetBrut(d, window.RATES); },
    'calcul-heures-supplementaires':  function(d) { return calcHeuresSup(d, window.RATES); },
    'calcul-indemnites-licenciement': function(d) { return calcLicenciement(d, window.RATES); },
    'calcul-rupture-conventionnelle': function(d) { return calcRuptureConventionnelle(d, window.RATES); },
    'calcul-prime-precarite':         function(d) { return calcPrimePrecarite(d, window.RATES); },
    'calcul-conges-payes':            function(d) { return calcCongesPayes(d, window.RATES); },
    'calcul-ticket-restaurant':       function(d) { return calcTicketRestaurant(d, window.RATES); },
    'calculateur-budget-mensuel':     function(d) { return calcBudget(d); },
    'niveau-de-richesse':             function(d) { return calcNiveauRichesse(d); },
  };

})();
