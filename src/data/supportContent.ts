// Shared "About Us" / FAQ / Contact content for Mlo Wangu.
//
// Deliberately plain data (no JSX, no web-only APIs) so the exact same
// module can be imported by a future Expo/React Native client without
// change — only the presentation layer (this repo's *View.tsx components)
// is web-specific.

export const SUPPORT_EMAIL = 'infomlowangu@gmail.com';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

export interface AboutSection {
  heading: string;
  body: string;
}

export const ABOUT_INTRO =
  'Mlo Wangu ("My Meal") is a Kenyan family meal, budget and shopping assistant. ' +
  'It exists to make one hard weekly question easier for Kenyan households: ' +
  '"What are we eating this week, and can we actually afford it?"';

export const ABOUT_SECTIONS: AboutSection[] = [
  {
    heading: 'The problem we solve',
    body:
      'Planning meals for a Kenyan household usually means juggling several things at once — what everyone likes and ' +
      'can eat, what is actually in season and affordable at the market this week, and how much money is left in the ' +
      'household budget. Mlo Wangu brings meal planning, grocery shopping, and household budgeting into one place so ' +
      'families can plan with confidence instead of guesswork.',
  },
  {
    heading: 'Weekly meal planning, built around your household',
    body:
      'Mlo Wangu generates a weekly Kenyan meal plan for your household, taking into account your family’s size, ' +
      'food preferences, allergies and dislikes. You can regenerate a new plan or swap out individual meals whenever ' +
      'your household’s needs change.',
  },
  {
    heading: 'Budget and expense planning, kept private',
    body:
      'Households can record their income and set category budgets (like Food, Rent and Transport), log day-to-day ' +
      'expenses, and see how spending compares to what was planned. Financial details are protected behind a ' +
      'household Budget PIN, separate from your account login.',
  },
  {
    heading: 'Smart grocery shopping lists',
    body:
      'A shopping list is automatically put together from your weekly meal plan’s ingredients, organised by ' +
      'category (grains, proteins, vegetables, fruits, dairy and pantry), with estimated local market prices so you ' +
      'know roughly what the week’s shopping will cost before you go.',
  },
  {
    heading: 'Hydration tracking',
    body:
      'A simple Hydration & Water Tracker on your home screen lets every household member log their water intake ' +
      'against a daily target, glass by glass.',
  },
  {
    heading: 'Affordable, practical, Kenyan',
    body:
      'Every meal in Mlo Wangu is a real Kenyan dish, and every price reflects local market realities. The goal is ' +
      'simple: help Kenyan families eat well and plan meals that fit real household budgets, without the guesswork ' +
      'of figuring it all out from scratch every week.',
  },
];

export interface ContactReason {
  label: string;
  detail: string;
}

export const CONTACT_REASONS: ContactReason[] = [
  { label: 'Account problems', detail: 'Trouble creating, accessing, or verifying your account.' },
  { label: 'Payments', detail: 'M-Pesa payment issues for Premium or a meal-plan generation.' },
  { label: 'Access codes', detail: 'Questions about a purchased or issued meal-plan access code.' },
  { label: 'Password / account access', detail: 'Resetting your password or regaining access to your account.' },
  { label: 'Meal planning', detail: 'Questions about how your weekly meal plan or shopping list was generated.' },
  { label: 'General assistance', detail: 'Anything else about using Mlo Wangu.' },
];

export interface FAQItem {
  q: string;
  a: string;
}

export interface FAQCategory {
  category: string;
  items: FAQItem[];
}

export const FAQ_CATEGORIES: FAQCategory[] = [
  {
    category: 'Account',
    items: [
      {
        q: 'How do I create a Mlo Wangu account?',
        a: 'On the sign-in screen, choose "Register" and provide your name, email address and a password (at least 8 characters). Your account is created immediately and you’ll be signed in.',
      },
      {
        q: 'How do I log in?',
        a: 'Use the email address and password you registered with on the sign-in screen.',
      },
      {
        q: 'What happens if I forget my password?',
        a: 'Choose "Forgot password" on the sign-in screen and enter your email address. If an account exists for that email, you’ll receive a password-reset link.',
      },
      {
        q: 'How do I contact support?',
        a: `Email ${SUPPORT_EMAIL} at any time — see the Contact & Support page for what we can help with.`,
      },
    ],
  },
  {
    category: 'Meal Plans',
    items: [
      {
        q: 'What does Mlo Wangu do?',
        a: 'Mlo Wangu plans weekly Kenyan meals for your household, builds a shopping list from those meals, helps you track your household budget and expenses, and lets you log your water intake — all in one app.',
      },
      {
        q: 'How are my meal plans generated?',
        a: 'Mlo Wangu selects Kenyan meals for your week based on your household size and the food preferences, allergies and dislikes recorded for your household members.',
      },
      {
        q: 'Can I tell Mlo Wangu about allergies and foods my household dislikes?',
        a: 'Yes. Each household member you add can have their own food preferences, allergies and dislikes, set from the Family Household page.',
      },
      {
        q: 'Can I change my household information?',
        a: 'Yes, at any time, from the Family Household page — add or edit household members, their age group, preferences, allergies and dislikes.',
      },
      {
        q: 'Can I regenerate/generate another meal plan?',
        a: 'Yes, using the "Generate New Plan" option. Generating a new plan uses a one-time meal-plan access entitlement (see the next question) — the plan you already have doesn’t require anything further.',
      },
      {
        q: 'How does the meal-plan access/payment system work?',
        a: 'Generating a new plan costs a one-time fee of KSh 50, paid via M-Pesa (Till/Paybill) or redeemed with a meal-plan access code. Once your payment is confirmed (or your code is redeemed), you can generate one new plan.',
      },
    ],
  },
  {
    category: 'Shopping',
    items: [
      {
        q: 'What is the Smart Grocery List?',
        a: 'It’s a shopping list automatically built from your current weekly meal plan’s ingredients, grouped by category with estimated local market prices, from the Shopping page.',
      },
      {
        q: 'How are shopping items generated from my meals?',
        a: 'Mlo Wangu reads the ingredients needed for your week’s meals, scales them to your household size, and combines matching ingredients into a single shopping list.',
      },
      {
        q: 'Can I edit my shopping list?',
        a: 'You can search and filter your list, and tap any item to mark it as purchased or not. The list itself is generated automatically from your meal plan rather than built item-by-item.',
      },
      {
        q: 'Can I add household items such as soap, detergent, milk, sugar, salt, cooking oil, etc.?',
        a: 'Food ingredients like milk, sugar, salt and cooking oil appear automatically whenever your week’s meals need them. Adding your own custom items (including non-food items like soap or detergent) is not currently supported.',
      },
      {
        q: 'Can I organize shopping into weekly and monthly items?',
        a: 'Not currently — your Smart Grocery List reflects your current week’s meal plan only; there isn’t a separate weekly/monthly split.',
      },
    ],
  },
  {
    category: 'Budget',
    items: [
      {
        q: 'How does the budget work?',
        a: 'From the Budget page (once unlocked with your Budget PIN), you can record your monthly income and set planned amounts for categories like Food, Rent and Transport, then track spending against those plans.',
      },
      {
        q: 'Can I enter and edit my salary/income?',
        a: 'Yes, from the Budget page — your monthly income can be set and updated at any time.',
      },
      {
        q: 'What happens when I record an expense?',
        a: 'The expense is saved against a category and date, and immediately reflected in your budget summary and category spending.',
      },
      {
        q: 'Does recording an expense reduce my remaining budget?',
        a: 'Yes — your remaining budget and category totals update immediately to reflect the expense.',
      },
      {
        q: 'What is the Budget PIN?',
        a: 'A separate 6-digit PIN that protects your household’s private financial information (income, budgets and expenses) behind a lock, independent of your account password. It auto-locks again after a period of inactivity.',
      },
      {
        q: 'What should I do if I forget my Budget PIN?',
        a: `There is currently no self-service Budget PIN reset. Contact support at ${SUPPORT_EMAIL} for help.`,
      },
    ],
  },
  {
    category: 'Payments / Access Codes',
    items: [
      {
        q: 'How can I purchase an access code?',
        a: 'From the "Generate New Plan" or "Upgrade to Premium" screens, choose to pay via M-Pesa Till/Paybill. Once your payment is verified, an entitlement or access code is issued to your account.',
      },
      {
        q: 'How do I submit my M-Pesa/Till transaction code?',
        a: 'After paying via the Till/Paybill number shown in the app, paste your M-Pesa confirmation message or code into the form provided so it can be matched to your payment.',
      },
      {
        q: 'How long does an access code last?',
        a: 'An issued meal-plan access code is valid for 7 days from when it’s issued.',
      },
      {
        q: 'What happens after an admin verifies my payment?',
        a: 'Depending on what you paid for, either your Premium membership is activated or a meal-plan access code is issued to you.',
      },
      {
        q: 'Where will I receive my access code?',
        a: 'You’ll see it as an in-app notification, and it’s also emailed to you.',
      },
      {
        q: 'What happens if my payment has not been verified?',
        a: 'Your payment stays pending until an admin reviews it. If it can’t be verified, you’ll get an in-app notification explaining why.',
      },
      {
        q: 'Who do I contact if I have a payment problem?',
        a: `Email ${SUPPORT_EMAIL} with your phone number and M-Pesa transaction code so we can look into it.`,
      },
    ],
  },
  {
    category: 'Notifications',
    items: [
      {
        q: 'What notifications/reminders can Mlo Wangu send?',
        a: 'You’ll see in-app notifications for account and payment events — such as a payment being submitted, verified or rejected, and access codes being issued.',
      },
      {
        q: 'Can I set my own reminders?',
        a: 'Not currently — there isn’t a reminder-scheduling feature yet. You can track your water intake manually any time from the Hydration widget on your Home screen.',
      },
    ],
  },
  {
    category: 'Privacy / Security',
    items: [
      {
        q: 'Is my account data private?',
        a: 'Yes. Your account and household data belong only to your account and are never shared with other users.',
      },
      {
        q: 'Can another household see my budget or expenses?',
        a: 'No. Your budget and expenses are private to your account, and financial details are additionally protected behind your own Budget PIN.',
      },
      {
        q: 'How is my account protected?',
        a: 'Your account is protected by your password and a secure sign-in session. Financial data has a second layer of protection — the Budget PIN — which locks automatically after a period of inactivity.',
      },
    ],
  },
];
