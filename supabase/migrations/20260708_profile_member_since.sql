-- Employee-editable "Member since" date on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS member_since date;
