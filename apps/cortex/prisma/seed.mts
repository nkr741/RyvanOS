import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { hash } from "bcryptjs";

if (process.env.NODE_ENV === "production") {
  console.error("ERROR: Seed script must not run in production. Use prisma/seed-production.mts instead.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Seeding database...");

  const adminPassword = await hash("admin123", 10);
  const bdePassword = await hash("bde123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@cortex.in" },
    update: {},
    create: { email: "admin@cortex.in", password: adminPassword, name: "Naveen Kumar", role: "admin", phone: "9876543210" },
  });
  const bde1 = await prisma.user.upsert({
    where: { email: "rahul@cortex.in" },
    update: {},
    create: { email: "rahul@cortex.in", password: bdePassword, name: "Rahul Sharma", role: "bde", phone: "9876543211" },
  });
  const bde2 = await prisma.user.upsert({
    where: { email: "priya@cortex.in" },
    update: {},
    create: { email: "priya@cortex.in", password: bdePassword, name: "Priya Patel", role: "bde", phone: "9876543212" },
  });
  const bde3 = await prisma.user.upsert({
    where: { email: "amit@cortex.in" },
    update: {},
    create: { email: "amit@cortex.in", password: bdePassword, name: "Amit Singh", role: "bde", phone: "9876543213" },
  });

  console.log("Users created");

  const bdes = [bde1.id, bde2.id, bde3.id];

  const categories = [
    "restaurant", "kirana", "supermarket", "pharmacy", "bakery",
    "cafe", "fruits_vegetables", "meat_shop", "electronics", "stationery",
  ];

  const businessNames: Record<string, string[]> = {
    restaurant: ["Spice Garden", "Delhi Darbar", "Tandoori Nights", "South Indian Cafe", "Biryani House", "Pizza Palace", "Burger King Express", "Chaat Corner", "Dhaba Express", "Royal Kitchen"],
    kirana: ["Sharma General Store", "New India Stores", "Lucky Provision", "Gupta Kirana", "Jai Hind Store"],
    supermarket: ["Fresh Mart", "Daily Needs", "Smart Bazaar", "City Supermarket"],
    pharmacy: ["Apollo Pharmacy", "MedPlus", "Wellness Pharma", "Health First"],
    bakery: ["Sweet Tooth Bakery", "Cake Walk", "Fresh Bake"],
    cafe: ["Brew House", "Coffee Culture", "Chai Point"],
    fruits_vegetables: ["Fresh Farm", "Green Basket", "Nature Fresh"],
    meat_shop: ["Fresh Meat Hub", "Chicken Express"],
    electronics: ["Tech World", "Gadget Zone"],
    stationery: ["Paper World", "Student Corner"],
  };

  const ownerNames = [
    "Rajesh Kumar", "Suresh Patel", "Mohammed Khan", "Anil Sharma", "Vijay Singh",
    "Ravi Verma", "Sanjay Gupta", "Manoj Tiwari", "Deepak Jain", "Prakash Reddy",
    "Meena Devi", "Lakshmi Iyer", "Fatima Begum", "Pooja Agarwal", "Neha Saxena",
    "Arjun Nair", "Kiran Rao", "Sunil Yadav", "Ramesh Mishra", "Ganesh Pillai",
  ];

  const platforms = ["swiggy", "zomato", "magicpin", "ondc", "dunzo", "blinkit"];
  const painPointsList = [
    "high_commission", "low_profit_margin", "rider_delay", "order_cancellations",
    "fake_reviews", "poor_customer_support", "payment_delay", "hidden_charges",
    "app_issues", "promotions_too_costly",
  ];

  const statuses = ["new", "interested", "follow_up", "not_interested"];
  const sentiments = ["positive", "neutral", "negative"];
  const interestLevels = ["hot", "warm", "cold"];
  const rynOneResponses = ["immediately", "within_3_months", "maybe", "no"];
  const areas = ["MG Road", "Jubilee Hills", "Banjara Hills", "Hitech City", "Madhapur", "Kukatpally", "Ameerpet", "Begumpet", "Secunderabad", "Gachibowli"];

  const hyderabadLocations = [
    { lat: 17.385, lng: 78.4867 }, { lat: 17.3616, lng: 78.4747 },
    { lat: 17.4399, lng: 78.4983 }, { lat: 17.4156, lng: 78.4347 },
    { lat: 17.3950, lng: 78.4400 }, { lat: 17.4483, lng: 78.3915 },
    { lat: 17.3713, lng: 78.4804 }, { lat: 17.4260, lng: 78.4530 },
    { lat: 17.4065, lng: 78.4772 }, { lat: 17.3850, lng: 78.4563 },
    { lat: 17.3500, lng: 78.5500 }, { lat: 17.4100, lng: 78.5200 },
    { lat: 17.4400, lng: 78.3500 }, { lat: 17.3200, lng: 78.5100 },
    { lat: 17.3900, lng: 78.3800 }, { lat: 17.4600, lng: 78.4200 },
    { lat: 17.3700, lng: 78.5300 }, { lat: 17.4300, lng: 78.4100 },
    { lat: 17.3400, lng: 78.4600 }, { lat: 17.4500, lng: 78.4800 },
  ];

  let surveyCount = 0;
  const surveyIds: string[] = [];

  for (const category of categories) {
    const names = businessNames[category] || [`${category} Business`];
    for (const bName of names) {
      const bde = bdes[surveyCount % bdes.length];
      const loc = hyderabadLocations[surveyCount % hyderabadLocations.length];
      const jitter = () => (Math.random() - 0.5) * 0.02;

      const selectedPlatforms = platforms.filter(() => Math.random() > 0.4).slice(0, 3);

      const painPoints: Record<string, number> = {};
      for (const pp of painPointsList) {
        painPoints[pp] = Math.floor(Math.random() * 5) + 1;
      }

      const commission = 15 + Math.random() * 20;
      const platformCommissions: Record<string, number> = {};
      for (const p of selectedPlatforms) {
        platformCommissions[p] = Math.round(15 + Math.random() * 18);
      }

      const dailyOnline = Math.floor(Math.random() * 80) + 5;
      const dailyWalkIn = Math.floor(Math.random() * 100) + 10;
      const aov = Math.floor(Math.random() * 400) + 100;
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const rynOne = rynOneResponses[Math.floor(Math.random() * rynOneResponses.length)];

      let leadScore = 0;
      if (rynOne === "immediately") leadScore += 25;
      else if (rynOne === "within_3_months") leadScore += 18;
      else if (rynOne === "maybe") leadScore += 10;
      leadScore += Math.min(20, Math.floor(dailyOnline / 3));
      const avgPain = Object.values(painPoints).reduce((a, b) => a + b, 0) / Object.values(painPoints).length;
      leadScore += Math.floor(avgPain * 3);
      leadScore += Math.min(15, Math.floor(commission / 2));
      leadScore += Math.floor(Math.random() * 15) + 5;
      leadScore = Math.min(100, leadScore);

      const years = Math.floor(Math.random() * 15) + 1;
      const summary = `${bName} is a ${category.replace(/_/g, " ")} business operating for ${years} years. Currently uses ${selectedPlatforms.length > 0 ? selectedPlatforms.join(", ") : "no online platforms"}. Paying approximately ${Math.round(commission)}% commission. Receives ${dailyOnline} online orders and ${dailyWalkIn} walk-in orders daily. Average order value: Rs${aov}. Main pain points: ${Object.entries(painPoints).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k.replace(/_/g, " ")).join(", ")}. ${rynOne === "immediately" ? "Strongly interested in joining RynOne." : rynOne === "within_3_months" ? "Open to joining within 3 months." : rynOne === "maybe" ? "Considering the switch." : "Not interested at this time."}`;

      const featureVotes: Record<string, number> = {
        real_time_analytics: Math.floor(Math.random() * 5) + 1,
        customer_database: Math.floor(Math.random() * 5) + 1,
        whatsapp_orders: Math.floor(Math.random() * 5) + 1,
        loyalty_program: Math.floor(Math.random() * 5) + 1,
        inventory_alerts: Math.floor(Math.random() * 5) + 1,
        sales_reports: Math.floor(Math.random() * 5) + 1,
        ai_insights: Math.floor(Math.random() * 5) + 1,
      };

      const daysAgo = Math.floor(Math.random() * 30);
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - daysAgo);
      createdAt.setHours(Math.floor(Math.random() * 10) + 8, Math.floor(Math.random() * 60));

      const survey = await prisma.vendorSurvey.create({
        data: {
          bdeId: bde,
          createdAt,
          updatedAt: createdAt,
          businessName: bName,
          ownerName: ownerNames[surveyCount % ownerNames.length],
          mobile: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
          whatsapp: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
          address: `${Math.floor(Math.random() * 500) + 1}, ${areas[surveyCount % 10]}, Hyderabad`,
          gpsLat: loc.lat + jitter(),
          gpsLng: loc.lng + jitter(),
          category,
          yearsInBusiness: years,
          numberOfBranches: Math.floor(Math.random() * 5) + 1,
          employees: Math.floor(Math.random() * 30) + 2,
          seatingCapacity: category === "restaurant" || category === "cafe" ? Math.floor(Math.random() * 80) + 10 : null,
          businessHours: "9:00 AM - 10:00 PM",
          weeklyOff: ["Monday", "Tuesday", "None", "None", "Sunday"][Math.floor(Math.random() * 5)],
          homeDelivery: Math.random() > 0.3,
          ownDeliveryStaff: Math.random() > 0.6,
          ownWebsite: Math.random() > 0.7,
          ownMobileApp: Math.random() > 0.85,
          ownWhatsappOrdering: Math.random() > 0.5,
          onlinePlatforms: JSON.stringify(selectedPlatforms),
          dailyOrdersWalkIn: dailyWalkIn,
          dailyOrdersOnline: dailyOnline,
          dailyOrdersPhone: Math.floor(Math.random() * 20),
          dailyOrdersWhatsapp: Math.floor(Math.random() * 15),
          averageOrderValue: aov,
          monthlyRevenue: Math.floor(Math.random() * 500000) + 50000,
          peakHours: "12:00 PM - 2:00 PM, 7:00 PM - 9:00 PM",
          bestSellingProducts: category === "restaurant" ? "Biryani, Butter Chicken, Naan" : "Daily essentials",
          painPoints: JSON.stringify(painPoints),
          currentCommission: Math.round(commission * 10) / 10,
          platformCommissions: JSON.stringify(platformCommissions),
          deliveryCharges: Math.floor(Math.random() * 30) + 10,
          whoPaysDelvery: ["business", "platform", "shared", "customer"][Math.floor(Math.random() * 4)],
          whoPaysPackaging: ["business", "platform", "shared"][Math.floor(Math.random() * 3)],
          whoPaysPromotions: ["business", "platform", "shared"][Math.floor(Math.random() * 3)],
          whoPaysDiscounts: ["business", "platform", "shared"][Math.floor(Math.random() * 3)],
          settlementFrequency: ["daily", "weekly", "monthly"][Math.floor(Math.random() * 3)],
          marketingChannels: JSON.stringify(["google", "instagram", "word_of_mouth"].filter(() => Math.random() > 0.4)),
          aiInterests: JSON.stringify(["inventory", "demand_prediction", "sales_analytics"].filter(() => Math.random() > 0.4)),
          wouldJoinRynOne: rynOne,
          featureVotes: JSON.stringify(featureVotes),
          businessSentiment: sentiments[Math.floor(Math.random() * sentiments.length)],
          interestLevel: interestLevels[Math.floor(Math.random() * interestLevels.length)],
          estimatedOrders: dailyOnline + Math.floor(Math.random() * 20),
          potentialRevenue: (dailyOnline + Math.floor(Math.random() * 20)) * aov * 30,
          riskLevel: ["low", "medium", "high"][Math.floor(Math.random() * 3)],
          aiSummary: summary,
          leadScore,
          leadStatus: status,
        },
      });

      surveyIds.push(survey.id);
      surveyCount++;
    }
  }

  console.log(`Created ${surveyCount} vendor surveys`);

  // Rider surveys
  const riderNames = [
    "Raju Kumar", "Suresh Babu", "Mohammed Irfan", "Venkatesh Reddy", "Ganesh Prasad",
    "Arun Kumar", "Bhaskar Rao", "Chandu Lal", "Dinesh Yadav", "Farhan Ahmed",
    "Gopal Krishna", "Hari Shankar", "Imran Khan", "Jagdish Rao", "Kishore Kumar",
  ];

  const riderAreas = ["Dilsukhnagar", "LB Nagar", "Uppal", "Tarnaka", "Malkajgiri"];
  const riderPrefs = ["Hitech City", "Jubilee Hills", "Madhapur", "Banjara Hills", "Gachibowli"];

  for (let i = 0; i < riderNames.length; i++) {
    const bde = bdes[i % bdes.length];
    const loc = hyderabadLocations[i % hyderabadLocations.length];
    const riderPlatforms = ["swiggy", "zomato", "blinkit", "shadowfax", "rapido"].filter(() => Math.random() > 0.4);

    const painPoints: Record<string, number> = {
      low_earnings: Math.floor(Math.random() * 5) + 1,
      long_waiting: Math.floor(Math.random() * 5) + 1,
      traffic: Math.floor(Math.random() * 5) + 1,
      support: Math.floor(Math.random() * 5) + 1,
      ratings: Math.floor(Math.random() * 5) + 1,
      incentives: Math.floor(Math.random() * 5) + 1,
    };

    const dailyEarnings = Math.floor(Math.random() * 800) + 400;
    const fuel = Math.floor(Math.random() * 3000) + 2000;
    const maintenance = Math.floor(Math.random() * 2000) + 500;
    const score = Math.floor(Math.random() * 40) + 55;
    const exp = Math.floor(Math.random() * 48) + 3;

    const daysAgo = Math.floor(Math.random() * 30);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);

    await prisma.riderSurvey.create({
      data: {
        bdeId: bde,
        createdAt,
        updatedAt: createdAt,
        riderName: riderNames[i],
        age: Math.floor(Math.random() * 20) + 20,
        gender: ["male", "male", "male", "female"][Math.floor(Math.random() * 4)],
        phone: `97${Math.floor(10000000 + Math.random() * 90000000)}`,
        address: `${riderAreas[i % 5]}, Hyderabad`,
        vehicleType: ["bike", "scooter", "bicycle", "ev"][Math.floor(Math.random() * 4)],
        insurance: Math.random() > 0.4,
        currentPlatforms: JSON.stringify(riderPlatforms),
        experienceMonths: exp,
        dailyEarnings,
        monthlyEarnings: dailyEarnings * 26,
        fuelCost: fuel,
        maintenanceCost: maintenance,
        netSavings: dailyEarnings * 26 - fuel - maintenance,
        hoursPerDay: Math.floor(Math.random() * 6) + 6,
        peakHours: "12 PM - 2 PM, 7 PM - 10 PM",
        preferredArea: riderPrefs[i % 5],
        nightShift: Math.random() > 0.6,
        painPoints: JSON.stringify(painPoints),
        averageWaiting: Math.floor(Math.random() * 20) + 5,
        whoShouldPayWait: ["restaurant", "platform", "nobody"][Math.floor(Math.random() * 3)],
        understandsPayout: ["yes", "no", "sometimes"][Math.floor(Math.random() * 3)],
        satisfactionRating: Math.floor(Math.random() * 5) + 4,
        wouldRecommend: Math.random() > 0.4,
        wantedBenefits: JSON.stringify(["insurance", "health_checkups", "fuel_discounts"].filter(() => Math.random() > 0.3)),
        wouldJoinRynOne: ["yes", "no", "maybe"][Math.floor(Math.random() * 3)],
        featureVotes: JSON.stringify({
          live_earnings: Math.floor(Math.random() * 5) + 1,
          income_forecast: Math.floor(Math.random() * 5) + 1,
          heat_map: Math.floor(Math.random() * 5) + 1,
        }),
        professionalism: Math.floor(Math.random() * 3) + 3,
        communication: Math.floor(Math.random() * 3) + 3,
        vehicleCondition: Math.floor(Math.random() * 3) + 3,
        documentsComplete: Math.random() > 0.3,
        riskLevel: ["low", "medium", "high"][Math.floor(Math.random() * 3)],
        likelihoodToJoin: ["high", "medium", "low"][Math.floor(Math.random() * 3)],
        overallScore: score,
        aiSummary: `${riderNames[i]} has ${exp} months of delivery experience. Currently works with ${riderPlatforms.join(", ")}. Earns approximately Rs${dailyEarnings}/day. ${Math.random() > 0.5 ? "Interested in joining RynOne." : "Open to exploring new platforms."}`,
        leadScore: score,
        leadStatus: ["new", "interested", "follow_up"][Math.floor(Math.random() * 3)],
        gpsLat: loc.lat + (Math.random() - 0.5) * 0.02,
        gpsLng: loc.lng + (Math.random() - 0.5) * 0.02,
      },
    });
  }

  console.log(`Created ${riderNames.length} rider surveys`);

  // Follow-ups for interested vendors
  const interestedSurveys = await prisma.vendorSurvey.findMany({
    where: { leadStatus: { in: ["interested", "follow_up"] } },
    select: { id: true, bdeId: true },
    take: 10,
  });

  const followUpNotes = [
    "Owner was interested but wanted to discuss with partner",
    "Need to show them the commission comparison",
    "Requested demo of the platform",
    "Follow up on document collection",
    "Wants to understand settlement process better",
  ];

  for (let i = 0; i < interestedSurveys.length; i++) {
    const row = interestedSurveys[i];
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + Math.floor(Math.random() * 5));
    scheduledAt.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);

    await prisma.followUp.create({
      data: {
        surveyId: row.id,
        bdeId: row.bdeId,
        scheduledAt,
        notes: followUpNotes[i % 5],
        status: Math.random() > 0.7 ? "completed" : "pending",
      },
    });
  }

  console.log("Created follow-ups");

  // Daily reports
  const reportAreas = ["Jubilee Hills", "Banjara Hills", "Hitech City", "Madhapur", "Kukatpally", "Ameerpet", "Gachibowli"];

  for (const bde of bdes) {
    for (let d = 0; d < 7; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      date.setHours(18, 0, 0, 0);

      await prisma.dailyReport.create({
        data: {
          bdeId: bde,
          date,
          visited: Math.floor(Math.random() * 10) + 8,
          completed: Math.floor(Math.random() * 8) + 5,
          interested: Math.floor(Math.random() * 5) + 2,
          strongLeads: Math.floor(Math.random() * 3) + 1,
          followUps: Math.floor(Math.random() * 4) + 1,
          summary: `Covered ${reportAreas[d % reportAreas.length]} area. Good response from restaurant owners.`,
        },
      });
    }
  }

  console.log("Created daily reports");
  console.log("\n--- Seed Complete ---");
  console.log("Admin login: admin@cortex.in / admin123");
  console.log("BDE login:   rahul@cortex.in / bde123");
  console.log("BDE login:   priya@cortex.in / bde123");
  console.log("BDE login:   amit@cortex.in  / bde123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
