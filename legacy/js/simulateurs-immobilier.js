// ─── Simulateurs Immobilier — Calcul JS pur (sans appel API) ─────────────────
// Les taux sont injectés par le serveur dans window.RATES

(function () {
  'use strict';

  // ─── Utilitaires ─────────────────────────────────────────────────────────
  function fmt(n) {
    return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function fmtE(n) { return fmt(n) + ' €'; }
  function fmtPct(n) { return fmt(n) + ' %'; }
  function r2(n) { return Math.round(n * 100) / 100; }

  // Calcul mensualité crédit (formule actuarielle)
  function mensualite(capital, tauxAnnuel, dureeAns) {
    const r = tauxAnnuel / 100 / 12;
    const n = dureeAns * 12;
    if (r === 0) return r2(capital / n);
    return r2((capital * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  }

  // Barème IR simplifié (revenus imposables par part, abattement 10% déjà appliqué)
  function calcIR(revenuImposable, nbParts, R) {
    const quotient = revenuImposable / nbParts;
    let impot = 0;
    const tranches = Object.values(R.taux_ir);
    for (let i = 0; i < tranches.length; i++) {
      const t = tranches[i];
      const suivant = tranches[i + 1];
      const min = t.min;
      const max = suivant ? suivant.min : Infinity;
      if (quotient <= min) break;
      impot += (Math.min(quotient, max) - min) * t.taux;
    }
    return r2(impot * nbParts);
  }

  // ─── 1. Frais de notaire ──────────────────────────────────────────────────
  function calcFraisNotaire(data, R) {
    const prix = parseFloat(data.prix);
    const type = data.type || 'ancien';
    if (!prix || prix <= 0) return null;

    if (type === 'neuf') {
      // Neuf : TVA déjà incluse, frais réduits
      // Droits de mutation réduits : 0.715%
      const droitsMutation = r2(prix * 0.00715);
      // Honoraires notaire (barème)
      const honoraires = r2(calcHonorairesNotaire(prix) * 1.2); // TTC
      const debours = 1200;
      const csi = r2(Math.max(15, prix * 0.001));
      const total = r2(droitsMutation + honoraires + debours + csi);
      const taux = r2(total / prix * 100);
      return {
        resultat: fmtE(total),
        explication: `Pour un bien neuf à ${fmtE(prix)}, les frais de notaire sont estimés à ${fmtE(total)} (${fmtPct(taux)} du prix). Les frais sont réduits car la TVA est déjà incluse dans le prix neuf.`,
        details: [
          `Droits de mutation réduits (0.715%) : ${fmtE(droitsMutation)}`,
          `Honoraires du notaire (TTC) : ${fmtE(honoraires)}`,
          `Débours et frais annexes : ${fmtE(debours)}`,
          `Contribution de sécurité immobilière (0.1%) : ${fmtE(csi)}`,
          `Total estimé : ${fmtE(total)} (${fmtPct(taux)})`,
          `Prix total (bien + frais) : ${fmtE(r2(prix + total))}`,
        ]
      };
    } else {
      // Ancien : droits de mutation élevés
      // Droits de mutation : 5.80665% (4.5% dpt + 1.2% commune + 0.1065% frais assiette)
      const droitsMutation = r2(prix * 0.0580665);
      const honoraires = r2(calcHonorairesNotaire(prix) * 1.2); // TTC
      const debours = 1200;
      const csi = r2(Math.max(15, prix * 0.001));
      const total = r2(droitsMutation + honoraires + debours + csi);
      const taux = r2(total / prix * 100);
      return {
        resultat: fmtE(total),
        explication: `Pour un bien ancien à ${fmtE(prix)}, les frais de notaire sont estimés à ${fmtE(total)} (${fmtPct(taux)} du prix). Ils comprennent principalement les droits de mutation versés au Trésor public.`,
        details: [
          `Droits de mutation (5.80665%) : ${fmtE(droitsMutation)}`,
          `Honoraires du notaire TTC : ${fmtE(honoraires)}`,
          `Débours et frais annexes : ${fmtE(debours)}`,
          `Contribution de sécurité immobilière : ${fmtE(csi)}`,
          `Total estimé : ${fmtE(total)} (${fmtPct(taux)})`,
          `Prix total (bien + frais) : ${fmtE(r2(prix + total))}`,
          'Certains départements appliquent un taux minoré de 4.5% → 3.8%.',
        ]
      };
    }
  }

  // Barème honoraires notaire HT (décret 2016, révisé 2021)
  function calcHonorairesNotaire(prix) {
    const tranches = [
      { max: 6500,   taux: 0.03945 },
      { max: 17000,  taux: 0.01627 },
      { max: 60000,  taux: 0.01085 },
      { max: Infinity, taux: 0.00814 },
    ];
    let prev = 0;
    let total = 0;
    for (const t of tranches) {
      const base = Math.min(prix, t.max) - prev;
      if (base <= 0) break;
      total += base * t.taux;
      prev = t.max;
    }
    return Math.max(r2(total), 90); // minimum 90€ HT
  }

  // ─── 2. Capacité d'emprunt ────────────────────────────────────────────────
  function calcCapaciteEmprunt(data) {
    const revenus = parseFloat(data.revenus_nets);
    const charges = parseFloat(data.charges_mensuelles) || 0;
    const taux = parseFloat(data.taux_interet);
    const duree = parseFloat(data.duree) || 20;
    if (!revenus || revenus <= 0 || !taux || taux <= 0) return null;

    // HCSF 2022 : taux d'endettement max 35% (assurance incluse)
    const tauxAssurance = 0.002 / 12; // ~0.2%/an de l'assuré
    const mensualiteMax = r2(revenus * 0.35 - charges);
    if (mensualiteMax <= 0) {
      return {
        resultat: '0 €',
        explication: `Vos charges actuelles (${fmtE(charges)}/mois) dépassent déjà 35% de vos revenus (${fmtE(r2(revenus * 0.35))}). Votre capacité d'emprunt est nulle selon les critères HCSF.`,
        details: [`Taux d'endettement actuel : ${fmtPct(r2(charges / revenus * 100))}`, 'Limite HCSF : 35%']
      };
    }

    // Mensualité hors assurance → on déduit l'assurance estimée
    const r = taux / 100 / 12;
    const n = duree * 12;
    let capital;
    if (r === 0) {
      capital = r2(mensualiteMax * n);
    } else {
      capital = r2(mensualiteMax / (r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)));
    }

    const mensualiteCredit = mensualite(capital, taux, duree);
    const coutTotal = r2(mensualiteCredit * n);
    const coutInterets = r2(coutTotal - capital);
    const tauxEndettement = r2((mensualiteCredit + charges) / revenus * 100);

    return {
      resultat: fmtE(capital),
      explication: `Avec ${fmtE(revenus)}/mois de revenus nets et ${fmtE(charges)}/mois de charges, vous pouvez emprunter jusqu'à ${fmtE(capital)} sur ${duree} ans à ${taux}% (mensualité ${fmtE(mensualiteCredit)}, taux d'endettement ${fmtPct(tauxEndettement)}).`,
      details: [
        `Mensualité maximale (35% revenus - charges) : ${fmtE(mensualiteMax)}`,
        `Capacité d'emprunt : ${fmtE(capital)}`,
        `Mensualité estimée : ${fmtE(mensualiteCredit)}/mois`,
        `Taux d'endettement : ${fmtPct(tauxEndettement)} (limite HCSF : 35%)`,
        `Durée : ${duree} ans — Taux : ${taux}%`,
        `Coût total des intérêts : ${fmtE(coutInterets)}`,
        'Ajoutez un apport personnel d\'au moins 10% pour les frais de notaire.',
      ]
    };
  }

  // ─── 3. Mensualités crédit immobilier ─────────────────────────────────────
  function calcMensualites(data) {
    const capital = parseFloat(data.montant);
    const taux = parseFloat(data.taux);
    const duree = parseFloat(data.duree);
    if (!capital || capital <= 0 || !taux || taux < 0 || !duree || duree <= 0) return null;

    const m = mensualite(capital, taux, duree);
    const n = duree * 12;
    const coutTotal = r2(m * n);
    const coutInterets = r2(coutTotal - capital);
    const tauxTotal = r2(coutInterets / capital * 100);

    // Tableau d'amortissement résumé (premières/dernières annuités)
    const r = taux / 100 / 12;
    let capitalRestant = capital;
    let interetsAn1 = 0, capitalAn1 = 0;
    for (let i = 0; i < Math.min(12, n); i++) {
      const interets = r2(capitalRestant * r);
      const amort = r2(m - interets);
      interetsAn1 += interets;
      capitalAn1 += amort;
      capitalRestant -= amort;
    }

    return {
      resultat: fmtE(m) + ' / mois',
      explication: `Pour un emprunt de ${fmtE(capital)} sur ${duree} ans à ${taux}%, la mensualité est de ${fmtE(m)}. Le coût total du crédit s'élève à ${fmtE(coutTotal)} dont ${fmtE(coutInterets)} d'intérêts (${fmtPct(tauxTotal)} du capital).`,
      details: [
        `Capital emprunté : ${fmtE(capital)}`,
        `Mensualité : ${fmtE(m)}/mois`,
        `Durée : ${duree} ans (${n} mensualités)`,
        `Coût total du crédit : ${fmtE(coutTotal)}`,
        `Coût des intérêts : ${fmtE(coutInterets)}`,
        `Intérêts versés en année 1 : ${fmtE(r2(interetsAn1))}`,
        `Capital remboursé en année 1 : ${fmtE(r2(capitalAn1))}`,
        'Hors assurance emprunteur (~0.2–0.4%/an du capital).',
      ]
    };
  }

  // ─── 4. Taux d'endettement ────────────────────────────────────────────────
  function calcTauxEndettement(data) {
    const revenus = parseFloat(data.revenus_nets);
    const mensualiteCredit = parseFloat(data.mensualite_credit) || 0;
    const autresCharges = parseFloat(data.autres_charges) || 0;
    if (!revenus || revenus <= 0) return null;

    const totalCharges = r2(mensualiteCredit + autresCharges);
    const taux = r2(totalCharges / revenus * 100);
    const limite = 35;
    const margeDisponible = r2(revenus * limite / 100 - totalCharges);
    const isOk = taux <= limite;

    let statut;
    if (taux <= 25) statut = 'Excellent — Très confortable';
    else if (taux <= 33) statut = 'Bon — Dans les normes bancaires';
    else if (taux <= 35) statut = 'Limite — Accepté sous conditions HCSF';
    else statut = 'Dépassé — Difficultés d\'emprunt attendues';

    return {
      resultat: fmtPct(taux) + ' — ' + statut,
      explication: `Votre taux d'endettement est de ${fmtPct(taux)} (charges ${fmtE(totalCharges)}/mois sur revenus ${fmtE(revenus)}/mois). ${isOk ? `Il reste en dessous de la limite HCSF de 35% avec ${fmtE(margeDisponible)}/mois de marge.` : `Il dépasse la limite HCSF de 35% de ${fmtE(Math.abs(margeDisponible))}/mois.`}`,
      details: [
        `Revenus nets mensuels : ${fmtE(revenus)}`,
        `Mensualité crédit : ${fmtE(mensualiteCredit)}`,
        autresCharges > 0 ? `Autres charges (leasing, crédits…) : ${fmtE(autresCharges)}` : null,
        `Total charges : ${fmtE(totalCharges)}/mois`,
        `Taux d'endettement : ${fmtPct(taux)}`,
        `Limite HCSF 2026 : 35%`,
        isOk ? `Marge disponible : ${fmtE(margeDisponible)}/mois` : `Dépassement : ${fmtE(Math.abs(margeDisponible))}/mois à réduire`,
        'Statut : ' + statut,
      ].filter(Boolean)
    };
  }

  // ─── 5. Plus-value immobilière ────────────────────────────────────────────
  function calcPlusValueImmo(data, R) {
    const prixAchat = parseFloat(data.prix_achat);
    const prixVente = parseFloat(data.prix_vente);
    const dureeDetention = parseFloat(data.duree_detention); // années
    const travaux = parseFloat(data.travaux) || 0;
    if (!prixAchat || !prixVente || !dureeDetention) return null;

    // Frais d'acquisition forfaitaires (7.5% si non justifiés, sinon réels)
    const fraisAcquis = r2(prixAchat * 0.075);
    const prixRevient = r2(prixAchat + fraisAcquis + travaux);
    const pvBrute = r2(prixVente - prixRevient);

    if (pvBrute <= 0) {
      return {
        resultat: 'Aucune plus-value',
        explication: `Le prix de revient (${fmtE(prixRevient)}) est supérieur ou égal au prix de vente (${fmtE(prixVente)}). Vous réalisez une moins-value non imposable.`,
        details: [
          `Prix d'achat : ${fmtE(prixAchat)}`,
          `Frais d'acquisition forfaitaires (7.5%) : ${fmtE(fraisAcquis)}`,
          `Travaux : ${fmtE(travaux)}`,
          `Prix de revient total : ${fmtE(prixRevient)}`,
          `Prix de vente : ${fmtE(prixVente)}`,
          `Résultat : moins-value de ${fmtE(Math.abs(pvBrute))} (non imposable)`,
        ]
      };
    }

    const ans = Math.floor(dureeDetention);

    // Abattements pour durée de détention
    // IR (19%) : 0% jusqu'à 5 ans, 6%/an de 6 à 21 ans, 4% la 22e → exo totale à 22 ans
    let abattIR = 0;
    if (ans >= 22) abattIR = 100;
    else if (ans >= 6) abattIR = Math.min(100, (ans - 5) * 6 + (ans >= 22 ? 4 : 0));

    // PS (17.2%) : 0% jusqu'à 5 ans, 1.65%/an de 6 à 21 ans, 1.60% la 22e, 9%/an de 23 à 30 ans → exo à 30 ans
    let abattPS = 0;
    if (ans >= 30) abattPS = 100;
    else if (ans >= 23) abattPS = Math.min(100, (21 - 5) * 1.65 + 1.60 + (ans - 22) * 9);
    else if (ans >= 22) abattPS = (21 - 5) * 1.65 + 1.60;
    else if (ans >= 6) abattPS = (ans - 5) * 1.65;

    const pvImposableIR = ans >= 22 ? 0 : r2(pvBrute * (1 - abattIR / 100));
    const pvImposablePS = ans >= 30 ? 0 : r2(pvBrute * (1 - abattPS / 100));

    const impotIR = r2(pvImposableIR * R.plus_value_immobiliere_taux);
    const impotPS = r2(pvImposablePS * R.ps_taux);
    const totalImpot = r2(impotIR + impotPS);
    const netVendeur = r2(prixVente - prixRevient - totalImpot);

    // Surtaxe PV > 50 000€
    let surtaxe = 0;
    if (pvImposableIR > 50000) {
      const grilles = [[50001,2],[100001,3],[150001,4],[200001,5],[250001,6]];
      for (const [seuil, taux] of grilles) {
        if (pvImposableIR >= seuil) surtaxe = r2(pvImposableIR * taux / 100);
      }
    }

    return {
      resultat: fmtE(totalImpot + surtaxe) + ' d\'impôt',
      explication: `Sur une plus-value brute de ${fmtE(pvBrute)}, après ${ans} an(s) de détention, l'impôt total est de ${fmtE(totalImpot + surtaxe)} (IR ${fmtE(impotIR + surtaxe)} + PS ${fmtE(impotPS)}). Le montant net perçu est ${fmtE(netVendeur)}.`,
      details: [
        `Prix de revient (achat + frais 7.5% + travaux) : ${fmtE(prixRevient)}`,
        `Prix de vente : ${fmtE(prixVente)}`,
        `Plus-value brute : ${fmtE(pvBrute)}`,
        `Durée de détention : ${ans} an(s)`,
        `Abattement IR (${(R.plus_value_immobiliere_taux * 100).toFixed(0)}%) : ${fmtPct(abattIR)} → PV imposable ${fmtE(pvImposableIR)}`,
        `Abattement PS (${(R.ps_taux * 100).toFixed(1)}%) : ${fmtPct(abattPS)} → PV imposable ${fmtE(pvImposablePS)}`,
        `Impôt IR (19%) : ${fmtE(impotIR)}`,
        surtaxe > 0 ? `Surtaxe PV > 50 000€ : ${fmtE(surtaxe)}` : null,
        `Prélèvements sociaux (17.2%) : ${fmtE(impotPS)}`,
        `Total impôt : ${fmtE(totalImpot + surtaxe)}`,
        `Net vendeur : ${fmtE(netVendeur)}`,
        ans >= 22 ? '✅ Exonération IR (détention > 22 ans)' : `Exonération IR dans ${22 - ans} an(s)`,
        ans >= 30 ? '✅ Exonération PS (détention > 30 ans)' : `Exonération PS dans ${30 - ans} an(s)`,
      ].filter(Boolean)
    };
  }

  // ─── 6. Rendement locatif ─────────────────────────────────────────────────
  function calcRendementLocatif(data) {
    const prixBien = parseFloat(data.prix_bien);
    const loyerMensuel = parseFloat(data.loyer_mensuel);
    const chargesAnnuelles = parseFloat(data.charges_annuelles) || 0;
    const travaux = parseFloat(data.travaux) || 0;
    if (!prixBien || prixBien <= 0 || !loyerMensuel || loyerMensuel <= 0) return null;

    const loyerAnnuel = r2(loyerMensuel * 12);
    // Frais de notaire estimés (bien ancien par défaut)
    const fraisNotaire = r2(prixBien * 0.08);
    const prixRevient = r2(prixBien + fraisNotaire + travaux);

    const rendBrut = r2(loyerAnnuel / prixBien * 100);
    const rendNet = r2((loyerAnnuel - chargesAnnuelles) / prixRevient * 100);
    // Fiscalité approximative : 30% (flat tax ou IR+PS foncier moyen)
    const revenuNetFisc = r2(loyerAnnuel - chargesAnnuelles);
    const fiscalite = r2(revenuNetFisc * 0.30);
    const rendNetNet = r2((revenuNetFisc - fiscalite) / prixRevient * 100);

    const GRM = r2(prixBien / loyerAnnuel); // Gross Rent Multiplier

    let conseil = '';
    if (rendBrut < 4) conseil = '⚠️ Rendement brut faible (< 4%) — Vérifiez la valorisation du bien.';
    else if (rendBrut < 6) conseil = '✅ Rendement correct pour une grande ville.';
    else conseil = '🏆 Bon rendement (> 6%) — Typique des villes moyennes ou de la province.';

    return {
      resultat: fmtPct(rendBrut) + ' brut / ' + fmtPct(rendNet) + ' net',
      explication: `Le rendement brut est de ${fmtPct(rendBrut)} et le rendement net (après charges) de ${fmtPct(rendNet)} sur un prix de revient de ${fmtE(prixRevient)}. ${conseil}`,
      details: [
        `Prix du bien : ${fmtE(prixBien)}`,
        `Frais de notaire estimés (8%) : ${fmtE(fraisNotaire)}`,
        travaux > 0 ? `Travaux : ${fmtE(travaux)}` : null,
        `Prix de revient total : ${fmtE(prixRevient)}`,
        `Loyer mensuel : ${fmtE(loyerMensuel)} → ${fmtE(loyerAnnuel)}/an`,
        chargesAnnuelles > 0 ? `Charges annuelles : ${fmtE(chargesAnnuelles)}` : null,
        `Rendement brut : ${fmtPct(rendBrut)}`,
        `Rendement net (après charges) : ${fmtPct(rendNet)}`,
        `Rendement net-net (après ~30% fiscalité) : ~${fmtPct(rendNetNet)}`,
        `GRM (Gross Rent Multiplier) : ${GRM} ans`,
        conseil,
      ].filter(Boolean)
    };
  }

  // ─── 7. Cashflow locatif ──────────────────────────────────────────────────
  function calcCashflow(data) {
    const loyer = parseFloat(data.loyer) || 0;
    const credit = parseFloat(data.credit_mensualite) || 0;
    const chargesCopro = parseFloat(data.charges_copro) || 0;
    const taxeFonciere = parseFloat(data.taxe_fonciere_mensuelle) || 0;
    const assurance = parseFloat(data.assurance) || 0;
    const gestion = parseFloat(data.gestion) || 0;
    const vacanceLocative = r2(loyer * 0.05); // 5% de vacance par défaut
    if (loyer <= 0) return null;

    const totalCharges = r2(credit + chargesCopro + taxeFonciere + assurance + gestion + vacanceLocative);
    const cashflow = r2(loyer - totalCharges);
    const cashflowAnnuel = r2(cashflow * 12);

    let statut;
    if (cashflow > 200) statut = '🏆 Excellent — Cashflow très positif';
    else if (cashflow > 0) statut = '✅ Positif — Investissement autofinancé';
    else if (cashflow > -100) statut = '⚠️ Légèrement négatif — Effort mensuel faible';
    else statut = '❌ Négatif — Effort d\'épargne significatif';

    return {
      resultat: (cashflow >= 0 ? '+' : '') + fmtE(cashflow) + ' / mois',
      explication: `Votre cashflow mensuel est de ${cashflow >= 0 ? '+' : ''}${fmtE(cashflow)}, soit ${cashflowAnnuel >= 0 ? '+' : ''}${fmtE(cashflowAnnuel)}/an. ${statut}`,
      details: [
        `Loyer perçu : +${fmtE(loyer)}/mois`,
        credit > 0 ? `Mensualité crédit : -${fmtE(credit)}` : null,
        chargesCopro > 0 ? `Charges de copropriété : -${fmtE(chargesCopro)}` : null,
        taxeFonciere > 0 ? `Taxe foncière (mensuel) : -${fmtE(taxeFonciere)}` : null,
        assurance > 0 ? `Assurance PNO + GLI : -${fmtE(assurance)}` : null,
        gestion > 0 ? `Frais de gestion : -${fmtE(gestion)}` : null,
        `Provision vacance locative (5%) : -${fmtE(vacanceLocative)}`,
        `Total charges mensuelles : -${fmtE(totalCharges)}`,
        `Cashflow mensuel : ${cashflow >= 0 ? '+' : ''}${fmtE(cashflow)}`,
        `Cashflow annuel : ${cashflowAnnuel >= 0 ? '+' : ''}${fmtE(cashflowAnnuel)}`,
        statut,
      ].filter(Boolean)
    };
  }

  // ─── 8. Simulateur LMNP ───────────────────────────────────────────────────
  function calcLMNP(data) {
    const loyerAnnuel = parseFloat(data.loyer_annuel);
    const chargesAnnuelles = parseFloat(data.charges_annuelles) || 0;
    const valeurBien = parseFloat(data.valeur_bien) || 0;
    const valeurMobilier = parseFloat(data.valeur_mobilier) || 0;
    if (!loyerAnnuel || loyerAnnuel <= 0) return null;

    // Régime Micro-BIC (si loyer ≤ 77 700€/an)
    const eligibleMicroBic = loyerAnnuel <= 77700;
    const revenuMicroBic = eligibleMicroBic ? r2(loyerAnnuel * 0.5) : null; // abattement 50%

    // Régime Réel simplifié
    // Amortissement bien : valeur hors terrain (80%) sur 25 ans
    const amortBien = valeurBien > 0 ? r2((valeurBien * 0.80) / 25) : 0;
    // Amortissement mobilier : sur 7 ans
    const amortMobilier = valeurMobilier > 0 ? r2(valeurMobilier / 7) : 0;
    // Amortissement composants immeuble (frais de notaire sur 5 ans, travaux sur 10 ans)
    const totalAmort = r2(amortBien + amortMobilier);
    const resultatReel = r2(loyerAnnuel - chargesAnnuelles - totalAmort);
    const revenuReelImposable = Math.max(0, resultatReel); // déficit reportable 10 ans

    // Comparaison : micro-BIC vs réel
    const reelPlusFavorable = eligibleMicroBic && revenuReelImposable < revenuMicroBic;
    const regimeConseille = (!eligibleMicroBic || reelPlusFavorable) ? 'Réel simplifié' : 'Micro-BIC';

    return {
      resultat: `Régime conseillé : ${regimeConseille}`,
      explication: `En LMNP, le régime ${regimeConseille} est le plus avantageux. Avec le réel, le revenu imposable est de ${fmtE(revenuReelImposable)}/an (grâce aux ${fmtE(totalAmort)}/an d'amortissements). En micro-BIC, il serait de ${eligibleMicroBic ? fmtE(revenuMicroBic) : 'non applicable'}/an.`,
      details: [
        `Loyers annuels : ${fmtE(loyerAnnuel)}`,
        chargesAnnuelles > 0 ? `Charges déductibles : ${fmtE(chargesAnnuelles)}` : null,
        `── Régime Micro-BIC ──`,
        eligibleMicroBic ? `Abattement 50% → Revenu imposable : ${fmtE(revenuMicroBic)}` : 'Non éligible (loyers > 77 700€)',
        `── Régime Réel simplifié ──`,
        valeurBien > 0 ? `Amortissement bien (80% sur 25 ans) : ${fmtE(amortBien)}/an` : null,
        valeurMobilier > 0 ? `Amortissement mobilier (sur 7 ans) : ${fmtE(amortMobilier)}/an` : null,
        `Total amortissements : ${fmtE(totalAmort)}/an`,
        `Revenu imposable réel : ${fmtE(revenuReelImposable)}/an`,
        resultatReel < 0 ? `Déficit LMNP reportable : ${fmtE(Math.abs(resultatReel))}/an (10 ans)` : null,
        `✅ Régime conseillé : ${regimeConseille}`,
        'Le statut LMNP est soumis à la CFE (cotisation foncière des entreprises).',
      ].filter(Boolean)
    };
  }

  // ─── 9. Taxe foncière ─────────────────────────────────────────────────────
  function calcTaxeFonciere(data, R) {
    const valeurLocativeBrute = parseFloat(data.valeur_locative_brute);
    const tauxLocal = parseFloat(data.taux_local) || (R.taxe_fonciere_taux_moyen * 100);
    const surface = parseFloat(data.surface) || 0;
    if (!valeurLocativeBrute && !surface) return null;

    let vlb = valeurLocativeBrute;
    // Si pas de VLB mais surface renseignée : estimation grossière
    if (!vlb && surface > 0) vlb = r2(surface * 90); // ~90€/m² de VLB indicative

    // Base nette = 50% de la VLB (abattement légal)
    const baseNette = r2(vlb * 0.5);
    // Revalorisation annuelle 2026 : +3.9% (coefficient légal)
    const baseRevalorisee = r2(baseNette * 1.039);
    const taxe = r2(baseRevalorisee * tauxLocal / 100);
    const taxeMensuelle = r2(taxe / 12);

    return {
      resultat: fmtE(taxe) + ' / an',
      explication: `La taxe foncière estimée est de ${fmtE(taxe)}/an (${fmtE(taxeMensuelle)}/mois). Elle est calculée sur la base nette de ${fmtE(baseRevalorisee)} (VLB ${fmtE(vlb)} × 50% × revalorisation 2026) appliquée au taux communal de ${fmtPct(tauxLocal)}.`,
      details: [
        `Valeur locative brute (VLB) : ${fmtE(vlb)}`,
        `Base nette (50% VLB) : ${fmtE(baseNette)}`,
        `Base revalorisée 2026 (+3.9%) : ${fmtE(baseRevalorisee)}`,
        `Taux de la commune : ${fmtPct(tauxLocal)}`,
        `Taxe foncière annuelle : ${fmtE(taxe)}`,
        `Mensualisation : ${fmtE(taxeMensuelle)}/mois`,
        'La VLB est fixée par le cadastre — consultez votre avis de taxe foncière pour la valeur exacte.',
        'Des exonérations existent pour les +75 ans sous conditions de revenus, les logements neufs (2 ans), etc.',
      ]
    };
  }

  // ─── 10. Simulateur PTZ ───────────────────────────────────────────────────
  function calcPTZ(data, R) {
    const prixAchat = parseFloat(data.prix_achat);
    const revenusFiscaux = parseFloat(data.revenus_fiscaux); // N-2
    const zone = data.zone || 'B1';
    const nbPersonnes = parseInt(data.nb_personnes) || 1;
    if (!prixAchat || prixAchat <= 0 || !revenusFiscaux || revenusFiscaux <= 0) return null;

    // Plafonds de ressources PTZ 2026 (revenus fiscaux N-2, par zone et composition)
    const plafonds = {
      A:    [37000, 51800, 62900, 74000, 85100, 96200, 107300, 118400],
      B1:   [30000, 42000, 51000, 60000, 69000, 78000, 87000,  96000],
      B2:   [27000, 37800, 45900, 54000, 62100, 70200, 78300,  86400],
      C:    [27000, 37800, 45900, 54000, 62100, 70200, 78300,  86400],
    };
    const idx = Math.min(nbPersonnes, 8) - 1;
    const plafond = plafonds[zone]?.[idx] ?? plafonds.B1[idx];

    if (revenusFiscaux > plafond) {
      return {
        resultat: 'Non éligible',
        explication: `Vos revenus fiscaux (${fmtE(revenusFiscaux)}) dépassent le plafond PTZ en zone ${zone} pour ${nbPersonnes} personne(s) : ${fmtE(plafond)}. Vous ne pouvez pas bénéficier du PTZ.`,
        details: [
          `Revenus fiscaux N-2 : ${fmtE(revenusFiscaux)}`,
          `Plafond PTZ zone ${zone} / ${nbPersonnes} pers. : ${fmtE(plafond)}`,
          `Dépassement : ${fmtE(r2(revenusFiscaux - plafond))}`,
          'Seules les résidences principales neuves (et certains logements anciens avec travaux) sont éligibles.',
        ]
      };
    }

    // Plafond opération (base de calcul du PTZ) par zone
    const plafondsOp = { A: 150000, B1: 135000, B2: 110000, C: 100000 };
    const plafondOp = plafondsOp[zone] ?? 135000;
    const baseCalc = Math.min(prixAchat, plafondOp);

    // Quotité du PTZ par zone
    const quotites = { A: R.ptz_taux_zone_a, B1: R.ptz_taux_zone_b1, B2: R.ptz_taux_zone_b2_c, C: R.ptz_taux_zone_b2_c };
    const quotite = quotites[zone] ?? 0.4;

    const montantPTZ = r2(baseCalc * quotite);

    // Durée et différé selon tranche de revenus (tranche 1 = plus modeste)
    const ratioRevenu = revenusFiscaux / plafond;
    let duree, differe;
    if (ratioRevenu <= 0.5) { duree = 25; differe = 15; }
    else if (ratioRevenu <= 0.7) { duree = 22; differe = 10; }
    else if (ratioRevenu <= 0.9) { duree = 20; differe = 5; }
    else { duree = 20; differe = 0; }

    const mensualitePTZ = differe < duree ? r2(montantPTZ / ((duree - differe) * 12)) : 0;

    return {
      resultat: fmtE(montantPTZ) + ' de PTZ',
      explication: `Vous êtes éligible au PTZ en zone ${zone}. Le montant est de ${fmtE(montantPTZ)} (${(quotite * 100).toFixed(0)}% de ${fmtE(baseCalc)}), sur ${duree} ans avec ${differe} ans de différé total. Mensualité après différé : ${fmtE(mensualitePTZ)}/mois (sans intérêts).`,
      details: [
        `Zone PTZ : ${zone}`,
        `Revenus fiscaux N-2 : ${fmtE(revenusFiscaux)} (plafond : ${fmtE(plafond)})`,
        `Prix d'achat : ${fmtE(prixAchat)} (plafond opération : ${fmtE(plafondOp)})`,
        `Base de calcul : ${fmtE(baseCalc)}`,
        `Quotité PTZ zone ${zone} : ${(quotite * 100).toFixed(0)}%`,
        `Montant PTZ : ${fmtE(montantPTZ)} (sans intérêts)`,
        `Durée totale : ${duree} ans — Différé : ${differe} ans`,
        `Mensualité après différé : ${fmtE(mensualitePTZ)}/mois`,
        '⚠️ PTZ uniquement pour l\'achat d\'une résidence principale neuve (ou ancien avec travaux dans certaines zones).',
        'Conditions : primo-accédant (pas propriétaire sur 2 ans), sous plafonds de revenus.',
      ]
    };
  }

  // ─── 11. SCI IR vs IS ─────────────────────────────────────────────────────
  function calcSciIrVsIs(data, R) {
    const revenusLocatifs = parseFloat(data.revenus_locatifs);
    const chargesDeductibles = parseFloat(data.charges_deductibles) || 0;
    const tauxIRMarginal = parseFloat(data.taux_ir_marginal) || 30; // TMI en %
    const interetEmprunt = parseFloat(data.interet_emprunt) || 0;
    if (!revenusLocatifs || revenusLocatifs <= 0) return null;

    // ── Régime IR (revenus fonciers) ──────────────────────────────────────
    const revenuFoncierNet = r2(revenusLocatifs - chargesDeductibles - interetEmprunt);
    const impotIR = revenuFoncierNet > 0 ? r2(revenuFoncierNet * (tauxIRMarginal / 100 + R.ps_taux)) : 0;
    const revenuNetIR = r2(revenusLocatifs - chargesDeductibles - interetEmprunt - impotIR);

    // ── Régime IS ─────────────────────────────────────────────────────────
    // Amortissement du bien non déductible en IR, déductible en IS
    const amortissementIS = parseFloat(data.amortissement_annuel) || 0;
    const resultatIS = r2(revenusLocatifs - chargesDeductibles - interetEmprunt - amortissementIS);
    const resultatISPositif = Math.max(0, resultatIS);

    // IS : 15% sur les 42 500 premiers €, 25% au-delà
    let impotIS = 0;
    if (resultatISPositif > 0) {
      const tranche1 = Math.min(resultatISPositif, 42500);
      const tranche2 = Math.max(0, resultatISPositif - 42500);
      impotIS = r2(tranche1 * 0.15 + tranche2 * 0.25);
    }
    const beneficeApresIS = r2(resultatISPositif - impotIS);

    // Dividendes : PFU 30% (12.8% IR + 17.2% PS) sur les dividendes distribués
    const pfu = r2(beneficeApresIS * 0.30);
    const revenuNetIS = r2(beneficeApresIS - pfu);

    const economieFiscale = r2(impotIR - (impotIS + pfu));

    return {
      resultat: economieFiscale > 0 ? `IS économise ${fmtE(economieFiscale)}/an` : `IR économise ${fmtE(Math.abs(economieFiscale))}/an`,
      explication: `En régime IR, vous payez ${fmtE(impotIR)}/an d'impôt (TMI ${tauxIRMarginal}% + PS 17.2%). En régime IS, l'IS + PFU sur dividendes représentent ${fmtE(impotIS + pfu)}/an. ${economieFiscale > 0 ? `La SCI IS est plus avantageuse de ${fmtE(economieFiscale)}/an.` : `La SCI IR est plus avantageuse de ${fmtE(Math.abs(economieFiscale))}/an.`}`,
      details: [
        `Revenus locatifs : ${fmtE(revenusLocatifs)}/an`,
        chargesDeductibles > 0 ? `Charges déductibles : ${fmtE(chargesDeductibles)}/an` : null,
        interetEmprunt > 0 ? `Intérêts d'emprunt : ${fmtE(interetEmprunt)}/an` : null,
        `── SCI à l'IR ──`,
        `Revenu foncier net imposable : ${fmtE(revenuFoncierNet)}`,
        `Impôt IR (${tauxIRMarginal}%) + PS (${(R.ps_taux * 100).toFixed(1)}%) : ${fmtE(impotIR)}`,
        `Revenu net après impôt : ${fmtE(revenuNetIR)}`,
        `── SCI à l'IS ──`,
        amortissementIS > 0 ? `Amortissement déductible IS : ${fmtE(amortissementIS)}/an` : null,
        `Résultat imposable IS : ${fmtE(resultatISPositif)}`,
        `IS (15% / 25%) : ${fmtE(impotIS)}`,
        `PFU sur dividendes (30%) : ${fmtE(pfu)}`,
        `Revenu net redistribué : ${fmtE(revenuNetIS)}`,
        `── Comparaison ──`,
        economieFiscale > 0 ? `✅ IS plus avantageux : +${fmtE(economieFiscale)}/an` : `✅ IR plus avantageux : +${fmtE(Math.abs(economieFiscale))}/an`,
        'Attention : SCI IS = plus-value à l\'IS à la revente (pas d\'abattement pour durée de détention).',
      ].filter(Boolean)
    };
  }

  // ─── 12. Achat vs Location ────────────────────────────────────────────────
  function calcAchatVsLocation(data, R) {
    const prixAchat = parseFloat(data.prix_achat);
    const loyerEquivalent = parseFloat(data.loyer_equivalent);
    const apport = parseFloat(data.apport) || 0;
    const tauxCredit = parseFloat(data.taux_credit) || 3.5;
    const dureeCredit = parseFloat(data.duree_credit) || 20;
    const tauxAppreciation = parseFloat(data.taux_appreciation) || 1.5; // %/an
    const horizon = parseFloat(data.horizon) || 10;
    if (!prixAchat || prixAchat <= 0 || !loyerEquivalent || loyerEquivalent <= 0) return null;

    // ── Coût de l'achat sur l'horizon ────────────────────────────────────
    const montantEmprunt = r2(prixAchat - apport);
    const fraisNotaire = r2(prixAchat * 0.08);
    const m = mensualite(montantEmprunt, tauxCredit, dureeCredit);
    const mensualitesHorizon = r2(m * 12 * horizon);
    // Intérêts sur l'horizon
    const totalRemboursement = r2(m * dureeCredit * 12);
    const totalInterets = r2(totalRemboursement - montantEmprunt);
    // Intérêts sur la période horizon (approximation linéaire)
    const interetsHorizon = r2(totalInterets * horizon / dureeCredit);
    // Charges propriétaire (taxe foncière + charges copro estimées)
    const chargesProprio = r2(prixAchat * 0.01 * horizon); // ~1%/an (taxe foncière + charges)
    // Valeur du bien après horizon
    const valeurFinale = r2(prixAchat * Math.pow(1 + tauxAppreciation / 100, horizon));
    // Capital remboursé
    const capitalRembourseHorizon = r2((montantEmprunt / (dureeCredit * 12)) * 12 * Math.min(horizon, dureeCredit));
    const patrimoineNet = r2(valeurFinale - (montantEmprunt - capitalRembourseHorizon));
    // Coût net achat = mensualités + frais + charges - plus-value patrimoine
    const coutBrutAchat = r2(apport + fraisNotaire + mensualitesHorizon + chargesProprio);
    const coutNetAchat = r2(coutBrutAchat - (valeurFinale - prixAchat)); // moins la plus-value

    // ── Coût de la location sur l'horizon ────────────────────────────────
    // Loyer revalorisé de 2%/an (IRL moyen)
    let coutLocation = 0;
    let loyer = loyerEquivalent;
    for (let i = 0; i < horizon; i++) {
      coutLocation += loyer * 12;
      loyer = r2(loyer * 1.02);
    }
    coutLocation = r2(coutLocation);
    // Opportunité : si l'apport était placé à 5% (ETF/AV)
    const opportuniteApport = r2(apport * (Math.pow(1.05, horizon) - 1));
    const coutLocationNet = r2(coutLocation - opportuniteApport);

    const achatPlusFavorable = coutNetAchat < coutLocationNet;

    return {
      resultat: achatPlusFavorable ? `Achat avantageux (+${fmtE(r2(coutLocationNet - coutNetAchat))})` : `Location avantageuse (+${fmtE(r2(coutNetAchat - coutLocationNet))})`,
      explication: `Sur ${horizon} ans, l'achat revient à ${fmtE(coutNetAchat)} net (après plus-value) contre ${fmtE(coutLocationNet)} en location (après rendement de l'apport). ${achatPlusFavorable ? 'L\'achat est plus avantageux.' : 'La location est plus avantageuse.'} Cette analyse dépend fortement des hypothèses de valorisation.`,
      details: [
        `── ACHAT ──`,
        `Prix d'achat : ${fmtE(prixAchat)} — Apport : ${fmtE(apport)}`,
        `Emprunt : ${fmtE(montantEmprunt)} à ${tauxCredit}% sur ${dureeCredit} ans`,
        `Frais de notaire : ${fmtE(fraisNotaire)}`,
        `Mensualité crédit : ${fmtE(m)}/mois`,
        `Total versé sur ${horizon} ans : ${fmtE(mensualitesHorizon)}`,
        `Charges propriétaire (~1%/an) : ${fmtE(chargesProprio)}`,
        `Valeur du bien dans ${horizon} ans (+${tauxAppreciation}%/an) : ${fmtE(valeurFinale)}`,
        `Coût net achat (après plus-value) : ${fmtE(coutNetAchat)}`,
        `── LOCATION ──`,
        `Loyer initial : ${fmtE(loyerEquivalent)}/mois (revalorisation IRL +2%/an)`,
        `Total loyers sur ${horizon} ans : ${fmtE(coutLocation)}`,
        `Gain apport placé à 5%/an : +${fmtE(opportuniteApport)}`,
        `Coût net location : ${fmtE(coutLocationNet)}`,
        `── VERDICT ──`,
        achatPlusFavorable ? `✅ Achat préférable de ${fmtE(r2(coutLocationNet - coutNetAchat))} sur ${horizon} ans` : `✅ Location préférable de ${fmtE(r2(coutNetAchat - coutLocationNet))} sur ${horizon} ans`,
        'Hypothèses : apport location placé à 5%/an, revalorisation bien +' + tauxAppreciation + '%/an, IRL +2%/an.',
      ]
    };
  }

  // ─── Registre des calculateurs JS ────────────────────────────────────────
  Object.assign(window.CALCULATEURS_JS = window.CALCULATEURS_JS || {}, {
    'calcul-frais-notaire':                function(d) { return calcFraisNotaire(d, window.RATES); },
    'simulateur-capacite-emprunt':         function(d) { return calcCapaciteEmprunt(d); },
    'calcul-mensualites-credit-immobilier':function(d) { return calcMensualites(d); },
    'calcul-taux-endettement':             function(d) { return calcTauxEndettement(d); },
    'calcul-plus-value-immobiliere':       function(d) { return calcPlusValueImmo(d, window.RATES); },
    'simulateur-rendement-locatif':        function(d) { return calcRendementLocatif(d); },
    'calcul-cashflow-locatif':             function(d) { return calcCashflow(d); },
    'simulateur-lmnp':                     function(d) { return calcLMNP(d); },
    'calcul-taxe-fonciere':                function(d) { return calcTaxeFonciere(d, window.RATES); },
    'simulateur-ptz':                      function(d) { return calcPTZ(d, window.RATES); },
    'sci-ir-vs-is':                        function(d) { return calcSciIrVsIs(d, window.RATES); },
    'achat-vs-location':                   function(d) { return calcAchatVsLocation(d, window.RATES); },
  });

})();
