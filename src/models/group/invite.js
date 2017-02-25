import * as uuid from "uuid";
import * as mandrill from "mandrill-api/mandrill";
import * as moment from "moment";

import getPgPool from "../../persistence/pg";

const pgPool = getPgPool();

/**
 * Invite a new member to the group.
 *
 * @param {Object} [opts] The request options
 * @param {string} [opts.email] The email address to invite
 * @param {string} [opts.project_id] The project ID to invite the user to
 */
export default function createInvite(opts) {
  return new Promise((resolve, reject) => {
    pgPool.connect((err, pg, done) => {
      if (err) {
        reject(err);
        return;
      }

      const invite = {
        id: uuid.v4().replace(/-/g, ""),
        project_id: opts.project_id,
        created: moment().valueOf(),
        email: opts.email,
      };

      const q = `insert into invite (
        id, project_id, created, email
      ) values (
        $1, $2, to_timestamp($3::double precision / 1000), $4
      )`;
      const v = [
        invite.id,
        invite.project_id,
        invite.created,
        invite.email,
      ];

      pg.query(q, v, (qerr, qresult) => {
        done();
        if (qerr) {
          console.log(qerr);
          reject(qerr);
          return;
        }

        // Send the email
        // TODO this should be async in a queue
        const mandrillClient = new mandrill.Mandrill(process.env.MANDRILL_KEY);
        const templateName = "retraced/invite-to-team";
        const templateContent = [];
        const mergeVars = [{
          name: "invite_url",
          content: `${process.env.RETRACED_PUBLIC_SITE}/invitation.html#${invite.id}`,
        }];

        const params = {
          template_name: templateName,
          template_content: templateContent,
        };

        mandrillClient.templates.render(params, function (rendered) {
          const moreParams = {
            message: {
              html: rendered.html,
              to: [{
                email: invite.email,
                type: "to",
              }],
              from_email: "contact@retraced.io",
              from_name: "Retraced",
              subject: "You have been invited to join a group on Retraced.",
              global_merge_vars: mergeVars,
            },
            async: false,
          };
          mandrillClient.messages.send(moreParams,
            function (result) {
              resolve(invite);
            },
            function (mandrillErr) {
              console.log("Error sending email: ", mandrillErr);
              reject(mandrillErr);
            },
          );
        }, function (mandrillErr) {
          console.log("Error rendering email: ", mandrillErr);
          reject(mandrillErr);
        });
      });
    });
  });
}
