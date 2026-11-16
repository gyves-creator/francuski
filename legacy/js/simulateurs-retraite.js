// ─── Simulateurs Retraite — Calcul JS pur (sans appel API) ───────────────────
(function () {
  'use strict';

  function fmt(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function fmtE(n) { return fmt(n) + ' €'; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ─── 1. Simulateur pension retraite ──────────────────────────────────────
  function calcPensionRetraite(data, R) {
    const salaireMoyen = parseFloat(data.salaire_moyen);
    const trimestres = parseInt(data.trimestres) || 0;
    const regime = data.regime || 'salarie';
    if (!salaireMoyen || salaireMoyen <= 0 || trimestres <= 0) return null;

    // Taux plein : 172 trimestres (génération 1968+)
    const trimestresPlein = 172;
    const tauxPlein = 0.50;

    // Taux de liquidation
    const tauxLiquidation = trimestres >= trimestresPlein ? tauxPlein : round2(tauxPlein * (trimestres / trimestresPlein));

    // Décote / surcote
    const ecart = trimestres - trimestresPlein;
    let decoteSurcote = 0;
    let decoteSurcoteLabel = '';
    if (ecart < 0) {
      // Décote : 1,25% par trimestre manquant (max 25 trimestres)
      const trimManquants = Math.min(Math.abs(ecart), 20);
      decoteSurcote = -round2(trimManquants * 0.0125);
      decoteSurcoteLabel = `Décote : ${trimManquants} trimestre(s) × 1,25% = -${(trimManquants * 1.25).toFixed(2)}%`;
    } else if (ecart > 0) {
      // Surcote : 1,25% par trimestre supplémentaire
      decoteSurcote = round2(ecart * 0.0125);
      decoteSurcoteLabel = `Surcote : ${ecart} trimestre(s) × 1,25% = +${(ecart * 1.25).toFixed(2)}%`;
    }

    // SAM (Salaire Annuel Moyen) : 25 meilleures années
    const sam = round2(salaireMoyen * 12);
    const tauxFinal = Math.min(tauxPlein, Math.max(0.25, tauxLiquidation + decoteSurcote));
    const pension = round2(sam * tauxFinal * (trimestres / trimestresPlein));
    const pensionMensuelle = round2(pension / 12);

    // Minimum contributif
    const minContributif = 876.50;
    const pensionFinale = Math.max(pensionMensuelle, trimestres >= trimestresPlein ? minContributif : 0);

    return {
      resultat: fmtE(round2(pensionFinale)) + ' / mois brut',
      explication: `Avec ${trimestres} trimestres validés et un salaire moyen de ${fmtE(salaireMoyen)}/mois, votre pension de retraite de base est estimée à ${fmtE(round2(pensionFinale))} brut/mois (taux de liquidation : ${(tauxFinal * 100).toFixed(2)}%). ${decoteSurcoteLabel}`,
      details: [
        `Salaire Annuel Moyen (SAM) estimé : ${fmtE(sam)}`,
        `Trimestres validés : ${trimestres} / ${trimestresPlein} pour le taux plein`,
        `Taux de liquidation : ${(tauxFinal * 100).toFixed(2)}%`,
        decoteSurcoteLabel || 'Taux plein atteint — ni décote ni surcote',
        `Pension annuelle brute : ${fmtE(round2(pensionFinale * 12))}`,
        `Pension mensuelle brute : ${fmtE(round2(pensionFinale))}`,
        `Minimum contributif (taux plein) : ${fmtE(minContributif)}/mois`,
        'Cette estimation concerne uniquement la retraite de base (Sécurité Sociale).',
      ]
    };
  }

  // ─── 2. Calcul âge de départ en retraite ────────────────────────────────
  function calcAgeDepartRetraite(data) {
    const anneeNaissance = parseInt(data.annee_naissance);
    const trimestres = parseInt(data.trimestres) || 0;
    if (!anneeNaissance || anneeNaissance < 1940 || anneeNaissance > 2000) return null;

    // Réforme 2023 : âge légal relevé progressivement à 64 ans
    let ageLegal = 62;
    let trimestresRequis = 172;

    if (anneeNaissance >= 1968) {
      ageLegal = 64;
      trimestresRequis = 172;
    } else if (anneeNaissance >= 1961) {
      // Montée progressive : +1 trimestre par génération pour l'âge légal
      const echelon = anneeNaissance - 1961;
      ageLegal = 62 + Math.floor((echelon + 3) / 4);
      trimestresRequis = 169 + Math.min(echelon, 3);
    } else if (anneeNaissance >= 1958) {
      ageLegal = 62;
      trimestresRequis = 167 + (anneeNaissance - 1958);
    } else {
      ageLegal = 62;
      trimestresRequis = 166;
    }

    const anneeDepartLegal = anneeNaissance + ageLegal;
    const ageMaxSansTauxPlein = 67; // âge d'annulation de la décote
    const anneeDepartMaxSansTauxPlein = anneeNaissance + ageMaxSansTauxPlein;
    const trimestresManquants = Math.max(0, trimestresRequis - trimestres);

    let conseil = '';
    if (trimestres >= trimestresRequis) {
      conseil = `✅ Vous avez suffisamment de trimestres pour partir à ${ageLegal} ans avec le taux plein.`;
    } else {
      const anneesManquantes = Math.ceil(trimestresManquants / 4);
      conseil = `⚠️ Il vous manque ${trimestresManquants} trimestre(s) (~${anneesManquantes} an(s) de travail) pour obtenir le taux plein à ${ageLegal} ans. Sans cela, vous devrez attendre ${ageMaxSansTauxPlein} ans.`;
    }

    return {
      resultat: `${ageLegal} ans (départ légal)`,
      explication: `Né(e) en ${anneeNaissance}, votre âge légal de départ est fixé à ${ageLegal} ans (réforme 2023). Le taux plein requiert ${trimestresRequis} trimestres. ${conseil}`,
      details: [
        `Année de naissance : ${anneeNaissance}`,
        `Âge légal de départ : ${ageLegal} ans (départ en ${anneeDepartLegal})`,
        `Trimestres requis pour le taux plein : ${trimestresRequis}`,
        `Trimestres déclarés : ${trimestres}`,
        trimestresManquants > 0 ? `Trimestres manquants : ${trimestresManquants}` : '✅ Taux plein acquis',
        `Âge d'annulation de la décote : ${ageMaxSansTauxPlein} ans (en ${anneeDepartMaxSansTauxPlein})`,
        'Générations 1968+ : âge légal = 64 ans, 172 trimestres requis.',
      ]
    };
  }

  // ─── 3. Calcul rachat de trimestres ──────────────────────────────────────
  function calcRachatTrimestres(data, R) {
    const salaire = parseFloat(data.salaire);
    const age = parseInt(data.age) || 50;
    const nb = parseInt(data.nb_trimestres) || 1;
    if (!salaire || salaire <= 0 || nb <= 0 || nb > 12) return null;

    // Coût indicatif rachat de trimestre (barème simplifié)
    // Le coût varie selon l'âge et le salaire. Barème officiel : ~3 000€ à 5 000€ / trimestre à 40 ans,
    // ~4 000€ à 7 000€ à 50 ans. On utilise un barème approximatif.
    const coeffAge = age <= 40 ? 0.04 : age <= 45 ? 0.05 : age <= 50 ? 0.065 : age <= 55 ? 0.08 : 0.10;
    const coutParTrimestre = round2(salaire * 12 * coeffAge);
    const coutTotal = round2(coutParTrimestre * nb);

    // Déduction fiscale : le rachat est déductible du revenu imposable (à 100%)
    const economieIR = round2(coutTotal * 0.30); // taux marginal moyen estimé 30%

    // Gain de pension estimé : chaque trimestre = +1/172 × pension
    // On estime la pension avec taux plein 50%
    const pensionAnnuelleEstimee = round2(salaire * 12 * 0.50);
    const gainParTrimestre = round2(pensionAnnuelleEstimee / 172 / 12);
    const gainMensuelTotal = round2(gainParTrimestre * nb);

    // Rentabilité : durée de récupération
    const coutNetIR = round2(coutTotal - economieIR);
    const moisRecuperation = gainMensuelTotal > 0 ? Math.ceil(coutNetIR / gainMensuelTotal) : 999;
    const anneesRecuperation = Math.ceil(moisRecuperation / 12);

    return {
      resultat: fmtE(coutTotal) + ` (${nb} trimestre${nb > 1 ? 's' : ''})`,
      explication: `Le rachat de ${nb} trimestre(s) est estimé à ${fmtE(coutTotal)} (soit ~${fmtE(coutParTrimestre)}/trimestre). Après déduction fiscale (~${fmtE(economieIR)}), le coût net est de ${fmtE(coutNetIR)}. Cela vous apporterait +${fmtE(gainMensuelTotal)}/mois de pension, récupéré en ~${anneesRecuperation} an(s).`,
      details: [
        `Salaire de référence : ${fmtE(salaire)}/mois`,
        `Âge actuel : ${age} ans`,
        `Trimestres à racheter : ${nb}`,
        `Coût estimé par trimestre : ${fmtE(coutParTrimestre)}`,
        `Coût total estimé : ${fmtE(coutTotal)}`,
        `Économie fiscale estimée (30% TMI) : -${fmtE(economieIR)}`,
        `Coût net après déduction fiscale : ${fmtE(coutNetIR)}`,
        `Gain de pension estimé : +${fmtE(gainMensuelTotal)}/mois`,
        `Durée de récupération estimée : ~${anneesRecuperation} an(s)`,
        '⚠️ Coût officiel à vérifier auprès de votre caisse de retraite (barème exact selon âge et salaire).',
      ]
    };
  }

  // ─── 4. Simulateur retraite complémentaire AGIRC-ARRCO ──────────────────
  function calcRetraiteComplementaire(data, R) {
    const salaireBrut = parseFloat(data.salaire_brut);
    const anciennete = parseFloat(data.anciennete) || 0;
    const regime = data.regime || 'cadre';
    if (!salaireBrut || salaireBrut <= 0 || anciennete <= 0) return null;

    const pass = R.pass_annuel;
    const salairAnnuel = salaireBrut * 12;

    // Taux de cotisation AGIRC-ARRCO 2026
    // Tranche 1 (jusqu'à 1 PASS) : 7,87% (part salarié 3,15% + employeur 4,72%)
    // Tranche 2 (de 1 à 8 PASS) : 21,59% (part salarié 8,64% + employeur 12,95%)
    const tauxAcquis_T1 = 0.0687; // taux d'acquisition de points tranche 1 (global / valeur du point)
    const tauxAcquis_T2 = 0.1868; // tranche 2

    // Valeur de service du point AGIRC-ARRCO 2026
    const valeurPoint = 1.4176;
    // Prix d'achat du point
    const prixPoint = 17.4018;

    const t1 = Math.min(salairAnnuel, pass);
    const t2 = Math.max(0, Math.min(salairAnnuel - pass, pass * 7));

    const cotisT1 = round2(t1 * tauxAcquis_T1);
    const cotisT2 = round2(t2 * tauxAcquis_T2);

    const pointsAnnuels = round2((cotisT1 + cotisT2) / prixPoint);
    const pointsTotaux = round2(pointsAnnuels * anciennete);
    const pensionAnnuelle = round2(pointsTotaux * valeurPoint);
    const pensionMensuelle = round2(pensionAnnuelle / 12);

    // Coefficient de minoration si départ avant 67 ans (abattement temporaire)
    const coef = data.depart_anticipe === 'oui' ? 0.90 : 1.00;
    const pensionFinale = round2(pensionMensuelle * coef);

    return {
      resultat: fmtE(pensionFinale) + ' / mois brut',
      explication: `Avec ${anciennete} an(s) de carrière et un salaire brut de ${fmtE(salaireBrut)}/mois, votre retraite complémentaire AGIRC-ARRCO est estimée à ${fmtE(pensionFinale)}/mois brut (${pointsTotaux.toFixed(0)} points × ${valeurPoint} €). ${coef < 1 ? 'Un coefficient de minoration temporaire de 10% s\'applique si vous partez avant 67 ans sans atteindre le taux plein.' : ''}`,
      details: [
        `Salaire brut annuel : ${fmtE(salairAnnuel)}`,
        `Points acquis par an (estimé) : ${pointsAnnuels.toFixed(2)}`,
        `Points totaux accumulés : ${pointsTotaux.toFixed(0)}`,
        `Valeur du point 2026 : ${valeurPoint} €`,
        `Prix d'achat du point 2026 : ${prixPoint} €`,
        `Pension annuelle brute : ${fmtE(round2(pensionFinale * 12))}`,
        `Pension mensuelle brute : ${fmtE(pensionFinale)}`,
        coef < 1 ? 'Coefficient de minoration temporaire (-10%) appliqué.' : 'Pas de minoration (départ à taux plein).',
        'Cette estimation s\'ajoute à la retraite de base Sécurité Sociale.',
      ]
    };
  }

  // ─── 5. Simulateur PER ───────────────────────────────────────────────────
  function calcPER(data, R) {
    const versementMensuel = parseFloat(data.versement_mensuel);
    const duree = parseFloat(data.duree) || 20;
    const taux = parseFloat(data.taux_rendement) / 100 || 0.04;
    const tmi = parseFloat(data.tmi) / 100 || 0.30;
    const capital_initial = parseFloat(data.capital_initial) || 0;
    if (!versementMensuel || versementMensuel <= 0 || duree <= 0) return null;

    // Capitalisation mensuelle
    const tauxMensuel = taux / 12;
    let capital = capital_initial;
    for (let i = 0; i < duree * 12; i++) {
      capital = capital * (1 + tauxMensuel) + versementMensuel;
    }
    capital = round2(capital);

    const totalVerse = round2(versementMensuel * duree * 12 + capital_initial);
    const interets = round2(capital - totalVerse);

    // Avantage fiscal : déductibilité des versements
    const plafondDeduction = Math.min(versementMensuel * 12, R.pass_annuel * 0.10);
    const economieIRannuelle = round2(plafondDeduction * tmi);
    const economieIRtotale = round2(economieIRannuelle * duree);

    // Fiscalité à la sortie (rente) : IR sur la rente
    // Sortie en capital : abattement 10% + barème IR
    const capitalNetEstime = round2(capital * 0.85); // approximation fiscalité sortie

    return {
      resultat: fmtE(capital) + ' à terme',
      explication: `En épargnant ${fmtE(versementMensuel)}/mois pendant ${duree} ans (rendement ${(taux * 100).toFixed(1)}%), votre PER atteindra ${fmtE(capital)}. L'avantage fiscal annuel est d'environ ${fmtE(economieIRannuelle)} (TMI ${(tmi * 100).toFixed(0)}%), soit ${fmtE(economieIRtotale)} sur la durée.`,
      details: [
        capital_initial > 0 ? `Capital initial : ${fmtE(capital_initial)}` : null,
        `Versement mensuel : ${fmtE(versementMensuel)}`,
        `Durée : ${duree} ans`,
        `Rendement annuel estimé : ${(taux * 100).toFixed(1)}%`,
        `Total versé : ${fmtE(totalVerse)}`,
        `Intérêts générés : ${fmtE(interets)}`,
        `Capital final estimé : ${fmtE(capital)}`,
        `Économie d'IR par an (TMI ${(tmi * 100).toFixed(0)}%) : ~${fmtE(economieIRannuelle)}`,
        `Économie d'IR totale sur ${duree} ans : ~${fmtE(economieIRtotale)}`,
        `Capital net estimé après fiscalité sortie : ~${fmtE(capitalNetEstime)}`,
        '⚠️ La fiscalité à la sortie dépend du mode (rente ou capital) et de votre situation.',
      ].filter(Boolean)
    };
  }

  // ─── 6. Cumul emploi-retraite ─────────────────────────────────────────────
  function calcCumulEmploiRetraite(data, R) {
    const pension = parseFloat(data.pension_mensuelle);
    const salaire = parseFloat(data.salaire_activite);
    const age = parseInt(data.age) || 65;
    const tauxPleinAtteint = data.taux_plein === 'oui';
    if (!pension || pension <= 0 || !salaire || salaire <= 0) return null;

    // Cotisations salariales sur le salaire d'activité
    const cotisations = round2(salaire * R.cotisations_salariales);
    const salaireNet = round2(salaire - cotisations);

    // Revenu total brut
    const revenuTotalBrut = round2(pension + salaire);
    const revenuTotalNet = round2(pension * 0.979 + salaireNet); // pension avec CSG ~2.1% net

    // En cumul libéralisé (taux plein atteint OU 67 ans) : pas de plafond
    // En cumul plafonné : le total pension + salaire ne peut pas dépasser le dernier salaire d'activité
    let plafond = 0;
    let regime = '';
    if (tauxPleinAtteint || age >= 67) {
      regime = 'Cumul libéralisé (taux plein atteint ou 67 ans)';
      plafond = 0;
    } else {
      regime = 'Cumul plafonné';
      plafond = round2(salaire * 1.60); // approximation : 160% du dernier salaire d'activité
    }

    // Nouvelles cotisations retraite : depuis la réforme, elles ouvrent des droits supplémentaires
    const pointsSupp = round2(cotisations / 12 / 17.40); // estimation points AGIRC-ARRCO

    return {
      resultat: fmtE(revenuTotalNet) + ' net / mois',
      explication: `En cumul emploi-retraite, vous percevez ${fmtE(pension)}/mois de pension + ${fmtE(salaireNet)}/mois net d'activité, soit ${fmtE(revenuTotalNet)}/mois net au total. Régime applicable : ${regime}.`,
      details: [
        `Pension mensuelle brute : ${fmtE(pension)}`,
        `Pension mensuelle nette (après CSG) : ~${fmtE(round2(pension * 0.979))}`,
        `Salaire brut d'activité : ${fmtE(salaire)}`,
        `Cotisations salariales : -${fmtE(cotisations)}`,
        `Salaire net d'activité : ${fmtE(salaireNet)}`,
        `Revenu total net estimé : ${fmtE(revenuTotalNet)}/mois`,
        `Régime : ${regime}`,
        plafond > 0 ? `Plafond indicatif (cumul plafonné) : ${fmtE(plafond)}/mois` : 'Aucun plafond (cumul libéralisé)',
        'Depuis 2023, les cotisations retraite en cumul emploi-retraite ouvrent de nouveaux droits.',
      ]
    };
  }

  // ─── Registre ────────────────────────────────────────────────────────────
  if (!window.CALCULATEURS_JS) window.CALCULATEURS_JS = {};
  Object.assign(window.CALCULATEURS_JS, {
    'simulateur-pension-retraite':        function(d) { return calcPensionRetraite(d, window.RATES); },
    'calcul-age-depart-retraite':         function(d) { return calcAgeDepartRetraite(d); },
    'calcul-rachat-trimestres':           function(d) { return calcRachatTrimestres(d, window.RATES); },
    'simulateur-retraite-complementaire': function(d) { return calcRetraiteComplementaire(d, window.RATES); },
    'simulateur-per':                     function(d) { return calcPER(d, window.RATES); },
    'simulateur-cumul-emploi-retraite':   function(d) { return calcCumulEmploiRetraite(d, window.RATES); },
  });

})();
