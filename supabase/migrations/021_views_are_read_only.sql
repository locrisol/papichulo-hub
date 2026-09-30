-- Every view is read only, for everybody.
--
-- Found by the audit of 28 September. The seven public_ views behind the QR
-- code allergen page each read one table and nothing else, which makes them
-- views the database will write through. They run as their owner, so a write
-- through one skips row level security. And Supabase gives anon and
-- authenticated ALL on anything new in public, so the grant block that added
-- SELECT to them had never taken the rest away. On live, anon held ALL on all
-- seven. With the key that ships in the website, anybody could have set every
-- allergen to none, deleted every dish's ingredients, or renamed a restaurant,
-- and roster_away let any employee delete a colleague's approved holiday.
--
-- Nothing ever did. change_log, which sits on the tables underneath, had no
-- write by anon on the day this was written.
--
-- Reading does not change: the allergen page reads exactly what it read
-- before, and staff read the two roster views as before. The views stay
-- security definer, which is what lets a customer read the menu without being
-- able to read the tables; only the write access goes.
--
-- The other four views are not writable (a join, a group by or a union), so
-- revoking on them changes nothing today. It is here so every view states who
-- may read it, rather than one view in the future quietly inheriting ALL.
--
-- Safe to run twice.

revoke all on public.public_menu_categories      from anon, authenticated, public;
revoke all on public.public_menu_item_components from anon, authenticated, public;
revoke all on public.public_menu_items           from anon, authenticated, public;
revoke all on public.public_mix_recipes          from anon, authenticated, public;
revoke all on public.public_product_allergens    from anon, authenticated, public;
revoke all on public.public_products             from anon, authenticated, public;
revoke all on public.public_restaurants          from anon, authenticated, public;

grant select on public.public_menu_categories      to anon, authenticated;
grant select on public.public_menu_item_components to anon, authenticated;
grant select on public.public_menu_items           to anon, authenticated;
grant select on public.public_mix_recipes          to anon, authenticated;
grant select on public.public_product_allergens    to anon, authenticated;
grant select on public.public_products             to anon, authenticated;
grant select on public.public_restaurants          to anon, authenticated;

revoke all on public.roster_colleagues        from anon, authenticated, public;
revoke all on public.roster_away              from anon, authenticated, public;
revoke all on public.checklist_last_done      from anon, authenticated, public;
revoke all on public.labour_by_day            from anon, authenticated, public;
revoke all on public.invoice_cost_by_category from anon, authenticated, public;

grant select on public.roster_colleagues        to authenticated;
grant select on public.roster_away              to authenticated;
grant select on public.checklist_last_done      to authenticated;
grant select on public.labour_by_day            to authenticated;
grant select on public.invoice_cost_by_category to authenticated;

notify pgrst, 'reload schema';
