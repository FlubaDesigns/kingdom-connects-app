import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./firebase-service-account.json', 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function importFactoids() {
  console.log('Importing factoids...');
  
  const factoids = [
    { text: "The smallest church in the United States is the Cross Island Chapel near Utica, New York. It seats only two people and sits on a tiny island in a pond.", active: true },
    { text: "The largest church building in the Christian world is St. Peter's Basilica in Vatican City. It can hold more than 60,000 people inside.", active: true },
    { text: "There are approximately 2.4 billion Christians in the world today, making Christianity the largest religion globally.", active: true },
    { text: "One of the oldest continuously used church buildings is located in Jordan and dates back to the 3rd century A.D.", active: true },
    { text: "The tallest church in the world is Ulm Minster in Germany, with a steeple reaching 530 feet high.", active: true },
    { text: "The United States has more churches than any other country, with over 380,000 churches nationwide.", active: true },
    { text: "Notre Dame Cathedral in Paris was the most visited church in the world before the fire, attracting over 13 million visitors per year.", active: true },
    { text: "Pentecostal and Charismatic Christianity is the fastest-growing Christian movement, especially in Africa, Latin America, and parts of Asia.", active: true },
    { text: "One of the largest Christian gatherings takes place in Nigeria, where some church events attract more than 5 million attendees.", active: true },
    { text: "Christian churches exist on every continent, including Antarctica, where chapels serve research stations.", active: true }
  ];

  for (const factoid of factoids) {
    await db.collection('factoids').add({
      ...factoid,
      created_at: new Date().toISOString()
    });
  }
  console.log(`Added ${factoids.length} factoids`);
}

async function importChurchQuestions() {
  console.log('Importing church questionnaire questions...');
  
  const questions = [
    { question_text: "How many active members attend your church regularly?", question_type: "number", audience: "church", required: true, placeholder: "e.g., 150", active: true, order: 1 },
    { question_text: "How long has your church been established?", question_type: "select", audience: "church", required: true, options: ["Under 1 year", "1-5 years", "5-10 years", "10-25 years", "25+ years"], active: true, order: 2 },
    { question_text: "How many services do you hold each week?", question_type: "number", audience: "church", required: true, placeholder: "e.g., 3", active: true, order: 3 },
    { question_text: "Which ministries are active at your church?", question_type: "multiselect", audience: "church", required: false, options: ["Youth", "Men's", "Women's", "Children's", "Seniors", "Music/Worship", "Outreach/Missions", "Small Groups", "Marriage/Family", "Prayer", "Other"], active: true, order: 4 },
    { question_text: "Does your church currently promote local Christian businesses?", question_type: "yesno", audience: "church", required: true, active: true, order: 5 },
    { question_text: "Would you be willing to feature Kingdom Connects to your congregation?", question_type: "yesno", audience: "church", required: true, active: true, order: 6 },
    { question_text: "What is your estimated weekly reach (including online)?", question_type: "number", audience: "church", required: false, placeholder: "e.g., 500", active: true, order: 7 },
    { question_text: "How did you hear about Kingdom Connects?", question_type: "select", audience: "church", required: true, options: ["Another church", "Business owner", "Online search", "Social media", "Word of mouth", "Kingdom Connects representative", "Other"], active: true, order: 8 },
    { question_text: "Would you like to receive a Kingdom Connects welcome kit?", question_type: "yesno", audience: "church", required: false, active: true, order: 9 },
    { question_text: "What is your church's mailing address? (for welcome kit and materials)", question_type: "textarea", audience: "church", required: false, placeholder: "Street address, City, State, ZIP", active: true, order: 10 }
  ];

  for (const question of questions) {
    await db.collection('questionnaire_questions').add({
      ...question,
      created_at: new Date().toISOString()
    });
  }
  console.log(`Added ${questions.length} questionnaire questions`);
}

async function main() {
  try {
    await importFactoids();
    await importChurchQuestions();
    console.log('Import complete!');
    process.exit(0);
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

main();
