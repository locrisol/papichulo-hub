-- Stock take session lifecycle support.
--
-- 1. Tighten stock_take_lines write policies:
--    - Employees can only modify their own lines (counted_by = auth.uid())
--    - All non-super-admin writes restricted to in_progress sessions
--    - super_admin retains full access for data corrections
--
-- 2. Add reopen audit fields on stock_takes so managers can revert a closed
--    session to in_progress for late corrections (e.g. accountant notices
--    something weeks later). The reopen is logged on the session itself.

-- Reopen audit fields
ALTER TABLE stock_takes
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reopen_reason TEXT;

-- Drop existing combined write policy on stock_take_lines, replace with
-- granular ones below.
DROP POLICY IF EXISTS "stock_take_lines_write" ON stock_take_lines;

CREATE POLICY "stock_take_lines_write_manager" ON stock_take_lines
  FOR ALL
  USING (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND get_my_role() IN ('owner', 'store_manager')
        AND st.restaurant_id = get_my_restaurant_id()
        AND st.status = 'in_progress'
    )
  )
  WITH CHECK (
    get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND get_my_role() IN ('owner', 'store_manager')
        AND st.restaurant_id = get_my_restaurant_id()
        AND st.status = 'in_progress'
    )
  );

CREATE POLICY "stock_take_lines_insert_employee" ON stock_take_lines
  FOR INSERT
  WITH CHECK (
    get_my_role() = 'employee'
    AND counted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND st.restaurant_id = get_my_restaurant_id()
        AND st.status = 'in_progress'
    )
  );

CREATE POLICY "stock_take_lines_update_own" ON stock_take_lines
  FOR UPDATE
  USING (
    get_my_role() = 'employee'
    AND counted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND st.status = 'in_progress'
    )
  )
  WITH CHECK (
    get_my_role() = 'employee'
    AND counted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND st.status = 'in_progress'
    )
  );

CREATE POLICY "stock_take_lines_delete_own" ON stock_take_lines
  FOR DELETE
  USING (
    get_my_role() = 'employee'
    AND counted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM stock_takes st
      WHERE st.id = stock_take_lines.stock_take_id
        AND st.status = 'in_progress'
    )
  );