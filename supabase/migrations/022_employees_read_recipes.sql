-- Employees can read MIX recipes.
--
-- Counting stock and logging waste are an employee's job, and a MIX is valued
-- from its recipe. Without the recipe the browser priced every MIX an employee
-- counted or wasted at nothing, so a stock take's total and the week's waste
-- depended on who was holding the phone. Found by the audit of 28 September;
-- his call on 29 September was to let them read it.
--
-- They could already read every product, its preferred price at their
-- restaurant and every quantity in every dish, so the recipes were the only
-- costing input kept from them. Writing a recipe stays with managers.
--
-- Safe to run twice.

alter policy "mix_recipes_select" on public.mix_recipes
    using ((select public.get_my_role()) = any (array['super_admin'::text, 'owner'::text, 'store_manager'::text, 'employee'::text]));

notify pgrst, 'reload schema';
