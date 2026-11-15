-- ============================================================
-- Suivi — la projection du mois de la page « Chiffre d'affaires »
-- (lib/revenue-page.ts, projectMonth ; maquette validée le 2026-11-15).
--
-- La règle : CA du mois = jours déjà lus + moyenne du même jour de semaine
-- (56 jours qui finissent au dernier jour lu) pour chaque jour restant.
-- Cette requête REJOUE la règle pour chaque mois passé, en se plaçant au
-- 8e jour lu du mois (la situation habituelle avec la semaine de retard de
-- Belpeople), et la compare au total réel du mois.
--
-- Seuil : un écart absolu > 10 % sur un mois complet, ou > 7 % en moyenne sur
-- trois mois, dit que la règle est fausse pour cet établissement (saison,
-- fermetures, tendance forte) → revoir projectMonth (tendance, jours fériés).
-- Lecture seule.
-- ============================================================

with params as (
  select 8 as cut_day
),
d as (
  select restaurant_id, sales_day, amount
  from daily_revenue_entries
  where amount is not null and outcome <> 'ferme'
),
months as (
  select restaurant_id, date_trunc('month', sales_day)::date as m,
         count(*) as noted, sum(amount) as actual
  from d
  group by 1, 2
  having count(*) >= extract(day from (date_trunc('month', min(sales_day)) + interval '1 month - 1 day'))::int * 0.9
),
cut as (
  select mo.restaurant_id, mo.m, mo.actual, (mo.m + ((select cut_day from params) - 1))::date as last_read
  from months mo
),
weektype as (
  select c.restaurant_id, c.m, extract(dow from d.sales_day)::int as wd, avg(d.amount) as avg_amount
  from cut c
  join d on d.restaurant_id = c.restaurant_id
        and d.sales_day between c.last_read - 55 and c.last_read
  group by 1, 2, 3
),
read_part as (
  select c.restaurant_id, c.m, sum(d.amount) as read_total
  from cut c
  join d on d.restaurant_id = c.restaurant_id and d.sales_day between c.m and c.last_read
  group by 1, 2
),
remaining as (
  select c.restaurant_id, c.m, sum(w.avg_amount) as estimated
  from cut c
  cross join lateral generate_series(c.last_read + 1, (c.m + interval '1 month - 1 day')::date, interval '1 day') g(day)
  join weektype w on w.restaurant_id = c.restaurant_id and w.m = c.m and w.wd = extract(dow from g.day)::int
  group by 1, 2
)
select c.restaurant_id,
       to_char(c.m, 'YYYY-MM') as mois,
       round(r.read_total + e.estimated) as projete_au_8,
       round(c.actual) as reel,
       round(100.0 * (r.read_total + e.estimated - c.actual) / nullif(c.actual, 0), 1) as ecart_pct
from cut c
join read_part r using (restaurant_id, m)
join remaining e using (restaurant_id, m)
order by c.restaurant_id, c.m;
