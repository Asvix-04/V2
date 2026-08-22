import React from "react";
import { Linkedin, Mail, Github } from "lucide-react";
import { PageTransition } from "../components/ui/PageTransition";

// profile pictures
import VigneshImg from "../assets/Vignesh.jpeg";
import SaiImg from "../assets/sai.jpg";
import MeshvImg from "../assets/mesh.jpg";
import SagarImg from "../assets/sagar.png";
import AtharvImg from "../assets/Atharv.jpeg";
import SatyamImg from "../assets/satyam.jpg";
import ShashwatiImg from "../assets/shashwati.png";
import ishaanImg from "../assets/ishan.jpeg";
import anupamaImg from "../assets/anupama.png";
import abdulImg from "../assets/abdul.jpeg";
import yashImg from "../assets/user.png";
import tejashriImg from "../assets/Tejashri.png";
import dhivyaImg from "../assets/user.png";
import BhartenduJhaImg from "../assets/bharat.jpeg";
import ankitImg from "../assets/ankit.png";
import supratikImg from "../assets/supratik.png";
import anushkaImg from "../assets/user.png"; 


const contributors = {
  teamLead: [
    {
      name: "Vignesh Skanda",
      role: "Team Lead",
      linkedin: "https://www.linkedin.com/in/vignesh-skanda-7a6363275/",
      email: "agvskanda@gmail.com",
      github: "https://github.com/vignesh1507",
      image: VigneshImg,
    },
  ],

  aiDevelopers: [
    {
      name: "Sai Panigrahi",
      role: "AI Developer",
      linkedin: "https://www.linkedin.com/in/sai-panigrahi",
      email: "find.saipanigrahi@gmail.com",
      github: "https://github.com/saai07/",
      image: SaiImg,
    },
    {
      name: "Meshv Patel",
      role: "AI Developer",
      linkedin: "https://www.linkedin.com/in/meshvpatel18",
      email: "meshvpatel1818@gmail.com",
      github: "https://github.com/Meshv1884",
      image: MeshvImg,
    },
    {
      name: "Satyam",
      role: "AI Developer",
      linkedin: "https://www.linkedin.com/in/usersatyam",
      email: "shivamsatyam35@gmail.com",
      github: "https://github.com/satyam13",
      image: SatyamImg,
    },
    {
      name: "yash jangid",
      role: "AI Developer",
      linkedin: "https://www.linkedin.com/in/yashjangid458",
      email: "yashjangid458@gmail.com",
      github: "https://github.com/yashjangid458",
      image: yashImg,
    },
    {
      name: "Tejashri Choudhary ",
      role: "AI Developer",
      linkedin: "https://www.linkedin.com/in/tejashri-choudhary-505a402a4/",
      email: "tejashrichoudhary2@gmail.com ",
      github: "https://github.com/tejashri-del098",
      image: tejashriImg,
    },
    
    {
      name: "Bhartendu Jha",
      role: "AI Developer",
      linkedin: "https://www.linkedin.com/in/bhartendu-jha-797807148/",
      email: "bhartenduvjha@gmail.com",
      github: "https://github.com/yugjha",
      image: BhartenduJhaImg, 
    },
    {
      name: "Anupama Rajesh",
      role: "AI Developer",
      linkedin: "https://www.linkedin.com/in/anupama-kr", 
      email: "anupamakrajesh11@gmail.com",
      github: "https://github.com/Anupama01022004",
      image: anupamaImg
    },
    {
      name: "Mohd Abdul Rahman",
      role: "AI Developer",
      linkedin: "https://www.linkedin.com/in/mohd-abdul-rahman-776479285 ", 
      email: "mohdabdulrahman510@gmail.com",
      github: "https://github.com/MohdAbdulRah",
      image: abdulImg

    },
    {
     name: "Supratik Bhowal",
      role: "AI Developer",
      linkedin: "https://www.linkedin.com/in/supratik-bhowal-b58906319/", 
      email: "supratikbhowal23@gmail.com",
      github: "https://github.com/SupratikB23/",
      image: supratikImg 
    }

  ],

  fullStackDevelopers: [
    {
      name: "Sagar Hedav",
      role: "Full Stack Developer",
      linkedin:
        "https://www.linkedin.com/in/sagar-hedav-085363261?utm_source=share_via&utm_content=profile&utm_medium=member_android",
      email: "fsintern1@email.com",
      image: SagarImg,
    },
    {
      name: "Shashwati B.U",
      role: "Full Stack Developer",
      linkedin: "https://www.linkedin.com/in/shashwati-b-u",
      email: "shashwati@example.com",
      image: ShashwatiImg,
    },
    {
      name: "Atharv Banne",
      role: "Full Stack Developer",
      linkedin: "https://www.linkedin.com/in/atharv-banne-958365256/",
      email: "banneatharv1010@gmail.com",
      github: "https://github.com/atharvbanne10",
      image: AtharvImg,
    },
    {
      name: "Ankit Kumar Yadav",
      role: "Full Stack Developer",
      linkedin: "https://www.linkedin.com/in/ankit-yadav-90712324b/",
      email: "ankityadav18193@gmail.com",
      github: "https://github.com/ankit18193",
      image: ankitImg,
    },

  ],
  researchAndDevelopment:[
    {
      name:"Anushka Gupta ",
      role:"Research And Development",
      linkedin:"https://www.linkedin.com/in/anushka-gupta-3175692a7?utm_source=share_via&utm_content=profile&utm_medium=member_android",
      email:"anushkag1211243@gmail.com ",
      github:"https://github.com/anushka1213",
      image: anushkaImg
    },
    {
      name:"Ishaan Goel",
      role:"Research And Development",
      linkedin:"https://www.linkedin.com/in/ishaan-vivek-goel",
      email:"ishaangoel.270906@gmail.com ",
      github:"https://github.com/Ishkondor",
      image: ishaanImg
    },
    {
      name: "Dhivya S",
      role: "Research And Development",
      linkedin: "http://www.linkedin.com/in/dhivya-sundar-557740334",
      email: "dhivyasundar4@gmail.com",
      github: "https://github.com/dhivya-sundar",
      image: dhivyaImg,
    },
    
  ]
};

function ContributorCard({ person }) {
  return (
    <div className="group rounded-2xl border border-border-base dark:border-white/10 bg-white dark:bg-slate-800 p-6 shadow-sm hover:shadow-xl hover:border-accent/50 transition-all duration-300 hover:-translate-y-1">

      {/* Profile image */}
      {person.image && (
        <div className="flex justify-center mb-4">
          <img
            src={person.image}
            alt={person.name}
            className="h-32 w-32 rounded-full object-cover ring-2 ring-white/10 group-hover:ring-accent/40 transition-all"
            style={person.name === "Vignesh Skanda" ? { objectPosition: "50% 40%" } : undefined}
          />
        </div>
      )}

      {/* Name + Role */}
      <div className="mb-4 text-center">
        <h3 className="text-lg font-semibold text-foreground">{person.name}</h3>
        <p className="text-sm text-foreground-muted">{person.role}</p>
      </div>

      {/* Links */}
      <div className="flex justify-center gap-3 pt-2 flex-wrap">
        <a
          href={person.linkedin}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-accent/10 text-accent hover:bg-accent/20 transition-colors backdrop-blur-sm"
        >
          <Linkedin className="h-4 w-4" />
          LinkedIn
        </a>

        <a
          href={`mailto:${person.email}`}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm"
        >
          <Mail className="h-4 w-4" />
          Email
        </a>

        {person.github && (
          <a
            href={person.github}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-sm"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        )}
      </div>
    </div>
  );
}

function Section({ title, members }) {
  const isSingle = members.length === 1;

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold text-foreground">{title}</h2>

      {isSingle ? (
        <div className="flex justify-center">
          <div className="w-full max-w-md">
            <ContributorCard person={members[0]} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {members.map((person, index) => (
            <ContributorCard key={index} person={person} />
          ))}
        </div>
      )}
    </section>
  );
}

export function Contributors() {
  return (
    <PageTransition className="pb-24">
      <div className="mx-auto max-w-7xl px-6 py-16 space-y-14">

        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            <span className="bg-gradient-to-b from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
              Contributors
            </span>
          </h1>
          <p className="text-foreground-muted max-w-2xl mx-auto">
            Meet the talented team behind DigiLab — building intelligent academic
            experiences through AI and modern technology.
          </p>
        </div>

        {/* Sections */}
        <Section title="Team Lead" members={contributors.teamLead} />
        <Section title="AI Developers" members={contributors.aiDevelopers} />
        <Section title="Full Stack Developers" members={contributors.fullStackDevelopers} />
        <Section title="Research And Development" members={contributors.researchAndDevelopment}/>

      </div>
    </PageTransition>
  );
}
