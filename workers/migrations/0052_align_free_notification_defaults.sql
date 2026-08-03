-- The effective free-plan policy has been 7/3/0, but legacy column defaults stored 7/3/1/0.
-- Only normalize free accounts still carrying that exact legacy default. Premium users may
-- have deliberately selected day 1, so their saved preferences must remain untouched.
UPDATE users
   SET notification_days = '7,3,0'
 WHERE is_premium = 0
   AND notification_days = '7,3,1,0';

UPDATE users
   SET renewal_notification_days = '7,3,0'
 WHERE is_premium = 0
   AND renewal_notification_days = '7,3,1,0';
