// ─── Simulateurs Auto — Calcul JS pur (sans appel API) ───────────────────────
(function () {
  'use strict';

  function fmt(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function fmtE(n) { return fmt(n) + ' €'; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ─── 1. Leasing vs Achat ──────────────────────────────────────────────────
  function calcLeasingVsAchat(data) {
    const prixVehicule = parseFloat(data.prix_vehicule);
    const loyerMensuel = parseFloat(data.loyer_mensuel);
    const apportLOA = parseFloat(data.apport_loa) || 0;
    const dureeContrat = parseFloat(data.duree_contrat) || 36;
    const loyerRachat = parseFloat(data.loyer_rachat) || 0;
    const apportAchat = parseFloat(data.apport_achat) || 0;
    const tauxCredit = parseFloat(data.taux_credit) / 100 || 0.045;
    const dureeCredit = parseFloat(data.duree_credit) || 48;
    if (!prixVehicule || !loyerMensuel) return null;

    // ── Coût total Leasing (LOA) ──
    const totalLoyersLOA = round2(loyerMensuel * dureeContrat + apportLOA);
    const coutLOAsansRachat = totalLoyersLOA;
    const coutLOAavecRachat = round2(totalLoyersLOA + loyerRachat);

    // ── Coût total Achat à crédit ──
    const montantEmprunte = round2(prixVehicule - apportAchat);
    const tauxMensuel = tauxCredit / 12;
    const mensualiteCredit = tauxMensuel > 0
      ? round2(montantEmprunte * tauxMensuel / (1 - Math.pow(1 + tauxMensuel, -dureeCredit)))
      : round2(montantEmprunte / dureeCredit);
    const totalCredit = round2(mensualiteCredit * dureeCredit + apportAchat);
    const coutInterets = round2(totalCredit - prixVehicule);

    // Valeur résiduelle estimée (dépréciation ~15% / an)
    const dureeAns = dureeContrat / 12;
    const valeurResiduelle = round2(prixVehicule * Math.pow(0.85, dureeAns));

    // Patrimoine net achat : valeur résiduelle - capital restant dû
    const capitalResteduCredit = dureeCredit > dureeContrat
      ? round2(prixVehicule * (1 - dureeContrat / dureeCredit))
      : 0;
    const patrimoineNetAchat = round2(valeurResiduelle - capitalResteduCredit);

    return {
      resultat: coutLOAsansRachat < totalCredit ? 'Leasing moins cher à court terme' : 'Achat moins cher au total',
      explication: `LOA : ${fmtE(loyerMensuel)}/mois × ${dureeContrat} mois = ${fmtE(coutLOAsansRachat)} (sans rachat). Achat à crédit : ${fmtE(mensualiteCredit)}/mois × ${dureeCredit} mois = ${fmtE(totalCredit)}. Mais à l'achat, vous détenez un bien d'une valeur estimée de ${fmtE(valeurResiduelle)} après ${dureeAns} an(s).`,
      details: [
        `Prix du véhicule : ${fmtE(prixVehicule)}`,
        `── LOA ──`,
        `Loyer mensuel : ${fmtE(loyerMensuel)}`,
        `Durée : ${dureeContrat} mois`,
        apportLOA > 0 ? `Premier loyer majoré : ${fmtE(apportLOA)}` : null,
        `Coût total LOA (sans rachat) : ${fmtE(coutLOAsansRachat)}`,
        loyerRachat > 0 ? `Loyer de rachat : ${fmtE(loyerRachat)}` : null,
        loyerRachat > 0 ? `Coût total LOA (avec rachat) : ${fmtE(coutLOAavecRachat)}` : null,
        `── Achat à crédit ──`,
        apportAchat > 0 ? `Apport : ${fmtE(apportAchat)}` : null,
        `Montant emprunté : ${fmtE(montantEmprunte)}`,
        `Mensualité crédit : ${fmtE(mensualiteCredit)}/mois × ${dureeCredit} mois`,
        `Coût des intérêts : ${fmtE(coutInterets)}`,
        `Coût total achat crédit : ${fmtE(totalCredit)}`,
        `Valeur résiduelle estimée (${dureeAns} ans) : ${fmtE(valeurResiduelle)}`,
        `Patrimoine net constitué : ${fmtE(patrimoineNetAchat)}`,
      ].filter(Boolean)
    };
  }

  // ─── 2. Électrique vs Thermique ──────────────────────────────────────────
  function calcElectriqueVsThermique(data) {
    const prixElec = parseFloat(data.prix_electrique);
    const prixThermique = parseFloat(data.prix_thermique);
    const kmAnnuels = parseFloat(data.km_annuels) || 15000;
    const prixKwhElec = parseFloat(data.prix_kwh) || 0.27;
    const prixCarburant = parseFloat(data.prix_carburant) || 1.80;
    const consoElec = parseFloat(data.conso_elec) || 16; // kWh/100km
    const consoThermique = parseFloat(data.conso_thermique) || 7; // L/100km
    if (!prixElec || !prixThermique) return null;

    // Bonus écologique électrique (indicatif 2026)
    const bonusElec = prixElec <= 47000 ? 4000 : 0;
    const prixElecNet = round2(prixElec - bonusElec);

    // Coûts énergétiques annuels
    const coutEnergiElec = round2(kmAnnuels / 100 * consoElec * prixKwhElec);
    const coutEnergiThermique = round2(kmAnnuels / 100 * consoThermique * prixCarburant);
    const economieCombustible = round2(coutEnergiThermique - coutEnergiElec);

    // Assurance (idem estimé)
    // Entretien : -30% pour électrique
    const entretienThermique = 1200;
    const entretienElec = round2(entretienThermique * 0.70);
    const economiEntretien = round2(entretienThermique - entretienElec);

    // Économies annuelles totales
    const economiesAnnuelles = round2(economieCombustible + economiEntretien);

    // Surcoût à l'achat
    const surcoutAchat = round2(prixElecNet - prixThermique);

    // Durée de rentabilisation
    const anneesROI = surcoutAchat > 0 && economiesAnnuelles > 0
      ? round2(surcoutAchat / economiesAnnuelles)
      : 0;

    return {
      resultat: surcoutAchat > 0 ? `Rentable en ${fmt(anneesROI)} ans` : 'Électrique moins cher dès l\'achat',
      explication: `Électrique net ${fmtE(prixElecNet)} (après bonus ${fmtE(bonusElec)}) vs Thermique ${fmtE(prixThermique)}. Surcoût : ${fmtE(surcoutAchat)}. Économies annuelles estimées : ${fmtE(economiesAnnuelles)}/an (énergie + entretien). Seuil de rentabilité : ${fmt(anneesROI)} ans.`,
      details: [
        `Prix électrique : ${fmtE(prixElec)}`,
        bonusElec > 0 ? `Bonus écologique : -${fmtE(bonusElec)}` : 'Pas de bonus (prix > 47 000 €)',
        `Prix électrique net : ${fmtE(prixElecNet)}`,
        `Prix thermique : ${fmtE(prixThermique)}`,
        `Surcoût électrique : ${fmtE(surcoutAchat)}`,
        `── Coût annuel sur ${fmt(kmAnnuels)} km ──`,
        `Énergie électrique (${consoElec} kWh/100km × ${prixKwhElec}€) : ${fmtE(coutEnergiElec)}/an`,
        `Carburant thermique (${consoThermique} L/100km × ${prixCarburant}€) : ${fmtE(coutEnergiThermique)}/an`,
        `Économie énergie : ${fmtE(economieCombustible)}/an`,
        `Économie entretien (estimée) : ${fmtE(economiEntretien)}/an`,
        `Économies totales : ${fmtE(economiesAnnuelles)}/an`,
        `Seuil de rentabilité : ${fmt(anneesROI)} an(s)`,
        'Le bonus écologique peut évoluer. Vérifiez les conditions sur service-public.fr.',
      ].filter(Boolean)
    };
  }

  // ─── 3. Calcul carte grise ────────────────────────────────────────────────
  function calcCarteGrise(data, R) {
    const cv = parseFloat(data.chevaux_fiscaux);
    const region = data.region || 'idf';
    const neuf = data.neuf === 'oui';
    const electrique = data.electrique === 'oui';
    if (!cv || cv <= 0) return null;

    // Taxe régionale Y1 (taux par cheval fiscal selon région 2026)
    const tauxRegionaux = {
      idf: 54.95, paca: 51.20, auvergne_rhone_alpes: 44.50,
      occitanie: 56.30, bretagne: 55.00, nouvelle_aquitaine: 45.00,
      normandie: 49.00, hauts_de_france: 36.20, grand_est: 48.00,
      pdl: 51.00, centre: 53.00, bourgogne: 57.00,
      default: R.carte_grise_taxe_cheval
    };
    const tauxRegion = tauxRegionaux[region] || tauxRegionaux.default;

    // Y1 = taxe régionale
    const y1 = electrique ? 0 : round2(cv * tauxRegion);

    // Y2 = taxe de gestion : 11€ (neuf) ou 13,76€ (occasion)
    const y2 = neuf ? 11 : 13.76;

    // Y3 = redevance acheminement : 2,76€
    const y3 = 2.76;

    // Y4 = taxe de restitution (occasion uniquement) : 0 si < 6 CV, sinon barème
    const y4 = 0; // simplifié

    // Y5 = taxe malus, calculée séparément

    const total = round2(y1 + y2 + y3 + y4);

    return {
      resultat: electrique ? fmtE(round2(y2 + y3)) + ' (exonéré Y1)' : fmtE(total),
      explication: `Pour un véhicule de ${cv} CV fiscaux${electrique ? ' électrique' : ''} immatriculé ${neuf ? 'neuf' : 'occasion'} en région ${region.replace(/_/g, ' ')}, la carte grise est estimée à ${fmtE(total)}. ${electrique ? 'Les véhicules électriques sont exonérés de la taxe régionale (Y1).' : `Taxe régionale : ${fmtE(y1)} (${tauxRegion}€/CV).`}`,
      details: [
        `Puissance fiscale : ${cv} CV`,
        `Région : ${region.replace(/_/g, ' ')}`,
        `Taux régional : ${tauxRegion} €/CV`,
        `Y1 (taxe régionale) : ${fmtE(y1)}${electrique ? ' → 0 € (exonération électrique)' : ''}`,
        `Y2 (taxe de gestion) : ${fmtE(y2)}`,
        `Y3 (redevance acheminement) : ${fmtE(y3)}`,
        `Total estimé : ${fmtE(total)}`,
        'Vérifiez le montant exact sur le site officiel : ants.gouv.fr',
      ]
    };
  }

  // ─── 4. Malus écologique ──────────────────────────────────────────────────
  function calcMalusEcologique(data, R) {
    const co2 = parseFloat(data.co2);
    const electrique = data.electrique === 'oui';
    if (!co2 || co2 < 0) return null;

    if (electrique || co2 <= 0) {
      return {
        resultat: '0 € (exonéré)',
        explication: 'Les véhicules électriques et hybrides rechargeables (PHEV < 50g CO₂/km) sont exonérés de malus écologique.',
        details: ['Exonération : véhicule électrique ou PHEV à très faibles émissions.']
      };
    }

    const baremes = R.malus_ecologique_2026;
    let malus = 0;
    let trancheLabel = '';
    let prev = 0;
    for (const b of baremes) {
      if (co2 <= (prev || 0)) break;
      if (b.max === null || co2 <= b.max) {
        malus = b.montant;
        trancheLabel = b.max ? `≤ ${b.max} g/km` : `> ${prev} g/km`;
        break;
      }
      prev = b.max;
    }

    // Plafonnement : malus ne peut dépasser 50% du prix du véhicule
    const prixVehicule = parseFloat(data.prix_vehicule) || 0;
    let malusFinal = malus;
    let plafonne = false;
    if (prixVehicule > 0 && malus > prixVehicule * 0.50) {
      malusFinal = round2(prixVehicule * 0.50);
      plafonne = true;
    }

    return {
      resultat: fmtE(malusFinal),
      explication: `Avec ${co2} g/km de CO₂, le malus écologique 2026 est de ${fmtE(malusFinal)}. ${plafonne ? `Plafonné à 50% du prix du véhicule (${fmtE(prixVehicule)}).` : ''}`,
      details: [
        `Émissions CO₂ : ${co2} g/km (cycle WLTP)`,
        `Tranche barème : ${trancheLabel}`,
        `Malus brut : ${fmtE(malus)}`,
        plafonne ? `Prix véhicule : ${fmtE(prixVehicule)}` : null,
        plafonne ? `Plafonnement 50% : ${fmtE(malusFinal)}` : null,
        `Malus à régler : ${fmtE(malusFinal)}`,
        'Le malus est payé une seule fois à l\'immatriculation. Seuil 2026 : 119 g/km.',
        'Source : barème officiel malus CO₂ 2026 (décret).',
      ].filter(Boolean)
    };
  }

  // ─── Registre ────────────────────────────────────────────────────────────
  if (!window.CALCULATEURS_JS) window.CALCULATEURS_JS = {};
  Object.assign(window.CALCULATEURS_JS, {
    'comparateur-leasing-achat':        function(d) { return calcLeasingVsAchat(d); },
    'comparateur-electrique-thermique': function(d) { return calcElectriqueVsThermique(d); },
    'calcul-carte-grise':               function(d) { return calcCarteGrise(d, window.RATES); },
    'calcul-malus-ecologique':          function(d) { return calcMalusEcologique(d, window.RATES); },
  });

})();
