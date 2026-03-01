import React from "react";
import { Linkedin, Mail, Github } from "lucide-react";

const contributors = {
  teamLead: [
    {
      name: "Vignesh Skanda",
      role: "Team Lead",
      image: "/images/Vignesh.png",
      linkedin: "https://www.linkedin.com/in/vignesh-skanda-7a6363275/",
      email: "agvskanda@gmail.com",
      github: "https://github.com/vignesh1507",
    },
  ],

  aiDevelopers: [
    {
      name: "Sai Panigrahi",
      role: "AI Developer",
      image: "/images/Sai.jpeg",
      linkedin: "https://www.linkedin.com/in/sai-panigrahi",
      email: "find.saipanigrahi@gmail.com",
      github: "https://github.com/saai07/",
    },
    {
      name: "Meshv Patel",
      role: "AI Developer",
      image: "/images/Mesh.jpeg",
      linkedin: "https://www.linkedin.com/in/meshvpatel18",
      email: "meshvpatel1818@gmail.com",
      github: "https://github.com/Meshv1884",
    },
    {
      name: "Satyam Shivam",
      role: "AI Developer",
      image: "/images/Satyam.jpeg",
      linkedin: "https://www.linkedin.com/in/usersatyam",
      email: "shivamsatyam35@gmail.com",
      github: "https://github.com/satyam13",
    },
  ],

  fullStackDevelopers: [
    {
      name: "Sagar Hedav",
      role: "Full Stack Developer",
      image: "/images/Sagar.jpeg",
      linkedin:
        "https://www.linkedin.com/in/sagar-hedav-085363261",
      email: "sagarhedav@email.com",
      github: "https://github.com/SagarHedav",
    },
    {
      name: "Shashwati BU",
      role: "Full Stack Developer",
      image: "/images/Shashwati.png",
      linkedin: "https://www.linkedin.com/in/shashwati-b-u/",
      email: "shashwatibu15@gmail.com",
      github: "https://github.com/Shash1811",
    },
    {
      name: "Atharv Banne",
      role: "Full Stack Developer",
      image: "/images/Atharv.jpeg",
      linkedin: "https://www.linkedin.com/in/atharv-banne-958365256/",
      email: "banneatharv1010@gmail.com",
      github: "https://github.com/atharvbanne10",
    },
  ],
};

function ContributorCard({ person }) {
  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-white/5 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">

      {/* Profile Photo */}
      <div className="flex justify-center mb-4">
        <div className="h-28 w-28 rounded-full overflow-hidden border-2 border-black/10 dark:border-white/20 shadow-sm">
          <img
            src={person.image}
            alt={person.name}
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold text-foreground">
          {person.name}
        </h3>
        <p className="mt-1 text-sm text-foreground-muted">
          {person.role}
        </p>
      </div>

      {/* Divider */}
      <div className="my-5 border-t border-black/10 dark:border-white/10" />

      {/* Action buttons */}
      <div className="flex justify-center gap-3 flex-wrap">
        <a
          href={person.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 transition"
        >
          <Linkedin className="h-4 w-4" />
          LinkedIn
        </a>

        <a
          href={`mailto:${person.email}`}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 transition"
        >
          <Mail className="h-4 w-4" />
          Email
        </a>

        {person.github && (
          <a
            href={person.github}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 transition"
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
          {members.map((person) => (
            <ContributorCard key={person.name} person={person} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Contributors() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-16 space-y-14">

      <div className="text-center space-y-3">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
          Contributors
        </h1>
        <p className="text-foreground-muted max-w-2xl mx-auto">
          Meet the talented team behind Asvix — building intelligent academic
          experiences through AI and modern technology.
        </p>
      </div>

      <Section title="Team Lead" members={contributors.teamLead} />
      <Section title="AI Developers" members={contributors.aiDevelopers} />
      <Section title="Full Stack Developers" members={contributors.fullStackDevelopers} />

    </div>
  );
}
